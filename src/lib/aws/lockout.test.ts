import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { dynamoLockoutStore, LOCKOUT_MAX, LOCKOUT_WINDOW_MS, LockoutContention } from './lockout';

const HASH = 'abc123';
const KEY = `PROAUTH#${HASH}`;
const NOW = 1_700_000_000_000;

const STEP1_UPDATE =
  'ADD #count :one SET windowStart = if_not_exists(windowStart, :now), #ttl = if_not_exists(#ttl, :ttl)';
const STEP1_CONDITION =
  'attribute_not_exists(windowStart) OR (windowStart > :cutoff AND #count < :max)';
const STEP2_UPDATE = 'SET #count = :one, windowStart = :now, #ttl = :ttl';
const STEP2_CONDITION = 'windowStart <= :cutoff';
const RELEASE_UPDATE = 'SET #count = #count - :one';
const RELEASE_CONDITION = 'attribute_exists(PK) AND #count > :zero AND windowStart = :ws';

function conditionFailure(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({ message: 'conditional', $metadata: {} });
}

function seedWindow(windowStart: number, count: number, ttl?: number): void {
  holder.fake.seed({
    PK: KEY,
    SK: KEY,
    windowStart,
    count,
    ttl: ttl ?? Math.floor((windowStart + LOCKOUT_WINDOW_MS) / 1000),
  });
}

function commandName(command: unknown): string {
  return (command as { constructor: { name: string } }).constructor.name;
}

function commandInput(command: unknown): Record<string, unknown> {
  return ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
}

/** Replace the fake's send; `intercept` may return a promise, or undefined to fall through. */
function wrapSend(
  intercept: (command: unknown) => Promise<Record<string, unknown>> | undefined,
): void {
  const original = holder.fake.send;
  holder.fake.send = (command: unknown) => intercept(command) ?? original(command);
}

beforeEach(() => {
  holder.fake = createFakeDynamoTable();
  process.env.DYNAMODB_TABLE_NAME = 'test-table';
});

describe('constants', () => {
  it('uses 5 attempts per 15 minutes', () => {
    expect(LOCKOUT_MAX).toBe(5);
    expect(LOCKOUT_WINDOW_MS).toBe(900_000);
  });
});

describe('reserve: first attempt', () => {
  it('creates the item with count 1, windowStart and ttl, and nothing else', async () => {
    const result = await dynamoLockoutStore.reserve(HASH, NOW);
    expect(result).toEqual({ allowed: true, windowStart: NOW, count: 1 });
    const item = holder.fake.get(KEY, KEY);
    expect(item).toEqual({
      PK: KEY,
      SK: KEY,
      count: 1,
      windowStart: NOW,
      ttl: Math.floor((NOW + 900_000) / 1000),
    });
    expect(item).not.toHaveProperty('GSI1PK');
    expect(item).not.toHaveProperty('GSI1SK');
    expect(item).not.toHaveProperty('status');
  });

  it('sends the exact step 1 expressions', async () => {
    await dynamoLockoutStore.reserve(HASH, NOW);
    const input = holder.fake.calls[0].input;
    expect(holder.fake.calls[0].name).toBe('UpdateCommand');
    expect(input.Key).toEqual({ PK: KEY, SK: KEY });
    expect(input.UpdateExpression).toBe(STEP1_UPDATE);
    expect(input.ConditionExpression).toBe(STEP1_CONDITION);
    expect(input.ExpressionAttributeNames).toEqual({ '#count': 'count', '#ttl': 'ttl' });
    expect(input.ExpressionAttributeValues).toEqual({
      ':one': 1,
      ':now': NOW,
      ':ttl': Math.floor((NOW + 900_000) / 1000),
      ':cutoff': NOW - 900_000,
      ':max': 5,
    });
    expect(input.ReturnValues).toBe('ALL_NEW');
  });
});

describe('reserve: limit', () => {
  it('allows 5 reserves and refuses the 6th with the exact retryAfterSeconds', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await dynamoLockoutStore.reserve(HASH, NOW + i * 1000);
      expect(r).toEqual({ allowed: true, windowStart: NOW + 1000, count: i });
    }
    // window started at NOW + 1000; at NOW + 101_000 there are 800 s left
    const sixth = await dynamoLockoutStore.reserve(HASH, NOW + 101_000);
    expect(sixth).toEqual({ allowed: false, retryAfterSeconds: 800 });
    expect(holder.fake.get(KEY, KEY)?.count).toBe(5);
  });

  it('rounds partial seconds up and returns 900 at the start of a window', async () => {
    seedWindow(NOW, 5);
    expect(await dynamoLockoutStore.reserve(HASH, NOW)).toEqual({ allowed: false, retryAfterSeconds: 900 });
    expect(await dynamoLockoutStore.reserve(HASH, NOW + 100_001)).toEqual({
      allowed: false,
      retryAfterSeconds: 800,
    });
  });

  it('never returns less than 1 near the end of the window', async () => {
    seedWindow(NOW, 5);
    expect(await dynamoLockoutStore.reserve(HASH, NOW + 899_999)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(await dynamoLockoutStore.reserve(HASH, NOW + 899_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('clamps to 900 when the stored windowStart is ahead of the clock', async () => {
    seedWindow(NOW + 100_000, 5);
    expect(await dynamoLockoutStore.reserve(HASH, NOW)).toEqual({ allowed: false, retryAfterSeconds: 900 });
  });

  it('sends a consistent GetItem after a refused step 1', async () => {
    seedWindow(NOW, 5);
    await dynamoLockoutStore.reserve(HASH, NOW + 1000);
    const get = holder.fake.calls.find((c) => c.name === 'GetCommand');
    expect(get?.input.Key).toEqual({ PK: KEY, SK: KEY });
    expect(get?.input.ConsistentRead).toBe(true);
  });
});

describe('reserve: expired window', () => {
  it('starts a new window with count 1 using the exact step 2 expressions', async () => {
    seedWindow(NOW - 900_000, 5);
    const result = await dynamoLockoutStore.reserve(HASH, NOW);
    expect(result).toEqual({ allowed: true, windowStart: NOW, count: 1 });
    expect(holder.fake.get(KEY, KEY)).toEqual({
      PK: KEY,
      SK: KEY,
      count: 1,
      windowStart: NOW,
      ttl: Math.floor((NOW + 900_000) / 1000),
    });
    expect(holder.fake.calls.map((c) => c.name)).toEqual(['UpdateCommand', 'GetCommand', 'UpdateCommand']);
    const step2 = holder.fake.calls[2].input;
    expect(step2.UpdateExpression).toBe(STEP2_UPDATE);
    expect(step2.ConditionExpression).toBe(STEP2_CONDITION);
    expect(step2.ExpressionAttributeNames).toEqual({ '#count': 'count', '#ttl': 'ttl' });
    expect(step2.ExpressionAttributeValues).toEqual({
      ':one': 1,
      ':now': NOW,
      ':ttl': Math.floor((NOW + 900_000) / 1000),
      ':cutoff': NOW - 900_000,
    });
  });
});

describe('reserve: races and failures', () => {
  it('loops back to step 1 when the item vanishes before the GetItem', async () => {
    seedWindow(NOW - 1000, 5);
    wrapSend((command) => {
      if (commandName(command) === 'GetCommand') holder.fake.items.delete(`${KEY}|${KEY}`);
      return undefined;
    });
    const result = await dynamoLockoutStore.reserve(HASH, NOW);
    expect(result).toEqual({ allowed: true, windowStart: NOW, count: 1 });
    expect(holder.fake.get(KEY, KEY)?.count).toBe(1);
  });

  it('loops back to step 1 when step 2 loses the race', async () => {
    seedWindow(NOW - 900_000, 5);
    let raced = false;
    wrapSend((command) => {
      const input = commandInput(command);
      if (!raced && input.UpdateExpression === STEP2_UPDATE) {
        raced = true;
        // Another request starts a fresh window first.
        seedWindow(NOW - 500, 1);
      }
      return undefined;
    });
    const result = await dynamoLockoutStore.reserve(HASH, NOW);
    expect(raced).toBe(true);
    expect(result).toEqual({ allowed: true, windowStart: NOW - 500, count: 2 });
    expect(holder.fake.calls.map((c) => c.name)).toEqual([
      'UpdateCommand',
      'GetCommand',
      'UpdateCommand',
      'UpdateCommand',
    ]);
  });

  it('refuses when a held GetItem resolves after another request opened a window', async () => {
    seedWindow(NOW - 900_000, 5);
    holder.fake.hold('GetCommand');
    const pending = dynamoLockoutStore.reserve(HASH, NOW);
    await vi.waitFor(() => expect(holder.fake.heldCount()).toBe(1));
    seedWindow(NOW - 10, 5);
    holder.fake.release();
    expect(await pending).toEqual({ allowed: false, retryAfterSeconds: 900 });
  });

  it('throws LockoutContention after 3 loops', async () => {
    const sent: string[] = [];
    wrapSend((command) => {
      sent.push(commandName(command));
      return commandName(command) === 'UpdateCommand' ? Promise.reject(conditionFailure()) : undefined;
    });
    await expect(dynamoLockoutStore.reserve(HASH, NOW)).rejects.toBeInstanceOf(LockoutContention);
    expect(sent).toEqual([
      'UpdateCommand',
      'GetCommand',
      'UpdateCommand',
      'UpdateCommand',
      'GetCommand',
      'UpdateCommand',
      'UpdateCommand',
      'GetCommand',
      'UpdateCommand',
    ]);
  });

  it('rethrows a non-conditional error from step 1', async () => {
    const boom = new Error('step1 boom');
    wrapSend(() => Promise.reject(boom));
    await expect(dynamoLockoutStore.reserve(HASH, NOW)).rejects.toBe(boom);
  });

  it('rethrows a non-conditional error from step 2', async () => {
    seedWindow(NOW - 900_000, 5);
    const boom = new Error('step2 boom');
    wrapSend((command) =>
      commandInput(command).UpdateExpression === STEP2_UPDATE ? Promise.reject(boom) : undefined,
    );
    await expect(dynamoLockoutStore.reserve(HASH, NOW)).rejects.toBe(boom);
  });

  it('rethrows an error from the GetItem', async () => {
    seedWindow(NOW, 5);
    const boom = new Error('get boom');
    wrapSend((command) => (commandName(command) === 'GetCommand' ? Promise.reject(boom) : undefined));
    await expect(dynamoLockoutStore.reserve(HASH, NOW)).rejects.toBe(boom);
  });
});

describe('reserve: decision uses windowStart, never ttl', () => {
  it('refuses a full current window even if ttl is stale', async () => {
    seedWindow(NOW - 1000, 5, 1);
    expect(await dynamoLockoutStore.reserve(HASH, NOW)).toEqual({
      allowed: false,
      retryAfterSeconds: 899,
    });
  });

  it('allows an under-limit current window even if ttl is in the past, and leaves ttl alone', async () => {
    seedWindow(NOW - 1000, 2, 1);
    expect(await dynamoLockoutStore.reserve(HASH, NOW)).toEqual({
      allowed: true,
      windowStart: NOW - 1000,
      count: 3,
    });
    expect(holder.fake.get(KEY, KEY)?.ttl).toBe(1);
  });

  it('starts a new window for an expired windowStart even if ttl is far in the future', async () => {
    seedWindow(NOW - 900_000, 5, 9_999_999_999);
    expect(await dynamoLockoutStore.reserve(HASH, NOW)).toEqual({ allowed: true, windowStart: NOW, count: 1 });
    expect(holder.fake.get(KEY, KEY)?.ttl).toBe(Math.floor((NOW + 900_000) / 1000));
  });
});

describe('release', () => {
  it('decrements the count of the same window with the exact expressions', async () => {
    seedWindow(NOW, 3);
    await dynamoLockoutStore.release(HASH, NOW);
    expect(holder.fake.get(KEY, KEY)?.count).toBe(2);
    const input = holder.fake.calls[0].input;
    expect(holder.fake.calls[0].name).toBe('UpdateCommand');
    expect(input.Key).toEqual({ PK: KEY, SK: KEY });
    expect(input.UpdateExpression).toBe(RELEASE_UPDATE);
    expect(input.ConditionExpression).toBe(RELEASE_CONDITION);
    expect(input.ExpressionAttributeNames).toEqual({ '#count': 'count' });
    expect(input.ExpressionAttributeValues).toEqual({ ':one': 1, ':zero': 0, ':ws': NOW });
  });

  it('never takes the count below 0', async () => {
    seedWindow(NOW, 1);
    await dynamoLockoutStore.release(HASH, NOW);
    await dynamoLockoutStore.release(HASH, NOW);
    await dynamoLockoutStore.release(HASH, NOW);
    expect(holder.fake.get(KEY, KEY)?.count).toBe(0);
  });

  it('does not decrement a newer window', async () => {
    seedWindow(NOW + 5000, 2);
    await dynamoLockoutStore.release(HASH, NOW);
    expect(holder.fake.get(KEY, KEY)?.count).toBe(2);
  });

  it('does nothing and creates nothing when the item is gone', async () => {
    await dynamoLockoutStore.release(HASH, NOW);
    expect(holder.fake.items.size).toBe(0);
  });

  it('rethrows a non-conditional error', async () => {
    const boom = new Error('release boom');
    wrapSend(() => Promise.reject(boom));
    await expect(dynamoLockoutStore.release(HASH, NOW)).rejects.toBe(boom);
  });
});

describe('table usage', () => {
  it('sends only Update and Get commands against PROAUTH# keys, never RATELIMIT#', async () => {
    for (let i = 0; i < 6; i++) await dynamoLockoutStore.reserve(HASH, NOW + i);
    await dynamoLockoutStore.reserve(HASH, NOW + 900_006);
    await dynamoLockoutStore.release(HASH, NOW + 900_006);
    expect(holder.fake.calls.length).toBeGreaterThan(0);
    for (const call of holder.fake.calls) {
      expect(['UpdateCommand', 'GetCommand']).toContain(call.name);
      const key = call.input.Key as { PK: string; SK: string };
      expect(key.PK).toBe(KEY);
      expect(key.SK).toBe(KEY);
    }
    for (const item of holder.fake.items.values()) {
      expect(String(item.PK).startsWith('RATELIMIT#')).toBe(false);
    }
  });
});
