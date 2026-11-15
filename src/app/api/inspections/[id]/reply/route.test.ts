import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  expectNoStore,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The reply route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the reply route');
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST } from './route';

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';
const TRIGGER = 'I can smell gas in the kitchen';
const TOO_LONG = 'Your reply is too long. Please shorten it to 500 characters or fewer.';
const EMPTY = 'Please write a reply before sending.';

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table' });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
});

afterEach(() => {
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function seed(item: object): void {
  holder.fake.seed({ ...item });
}

function call(id: string, body: unknown): Promise<Response> {
  return callWithId(POST, makeRequest(`/api/inspections/${id}/reply`, { body }), id);
}

function expectCleanHeaders(res: Response): void {
  expectNoStore(res);
  expect(res.headers.get('set-cookie')).toBeNull();
}

function storedJob(id: string): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('job missing');
  return item;
}

function padded(prefix: string, length: number): string {
  return `${prefix} ${'x'.repeat(length - prefix.length - 1)}`;
}

function writeCalls(): number {
  return holder.fake.calls.filter((c) => c.name === 'UpdateCommand' || c.name === 'PutCommand').length;
}

function countOf(name: string): number {
  return holder.fake.calls.filter((c) => c.name === name).length;
}

describe('POST /api/inspections/[id]/reply', () => {
  describe('success', () => {
    it('stores the trimmed reply, bumps replyCount and returns { status: "new" } only', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text: '  Yes, it is constant.  ' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'new' });
      expectCleanHeaders(res);

      const stored = storedJob(item.id);
      const replies = stored.replies as Array<{ text: string }>;
      expect(stored.status).toBe('new');
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toBe('Yes, it is constant.');
      expect(stored.replyCount).toBe(replies.length);
    });

    it('accepts exactly 500 characters', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text: 'a'.repeat(500) });
      expect(res.status).toBe(200);
      expect((storedJob(item.id).replies as Array<{ text: string }>)[0].text).toHaveLength(500);
    });
  });

  describe('validation', () => {
    it.each([[5], [null], [['a']], [undefined]])('returns 400 for a non-string text (%j)', async (text) => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_REQUEST' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });

    it.each([[''], ['   \n ']])('returns 400 with the empty-reply message for %j', async (text) => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_REQUEST', message: EMPTY });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });

    it.each([501, 600])('returns 400 for %i characters without a trigger and writes nothing', async (length) => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text: 'a'.repeat(length) });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'INVALID_REQUEST', message: TOO_LONG });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
      expect(storedJob(item.id).status).toBe('info_requested');
    });
  });

  describe('not found', () => {
    it('returns 404 for a non-UUID without touching the table', async () => {
      const res = await call('not-a-uuid', { text: 'hello' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });

    it('returns 404 for an unknown UUID', async () => {
      const res = await call(UNKNOWN_ID, { text: 'hello' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });

    it('returns 404 for a legacy job', async () => {
      const legacy = makeLegacyJobItem();
      seed(legacy);
      const res = await call(legacy.id as string, { text: 'hello' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });
  });

  describe('body size', () => {
    it('returns 413 over 4 KB and does not check a trigger inside it', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      const before = structuredClone(storedJob(item.id));
      const res = await call(item.id, { text: padded(TRIGGER, 5000) });
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
      expect(storedJob(item.id)).toEqual(before);
    });
  });

  describe('safety override', () => {
    it.each([600, 4000])('returns 200 emergency for a trigger in %i characters and applies the override', async (length) => {
      const item = makeJobItem('info_requested');
      seed(item);
      const res = await call(item.id, { text: padded(TRIGGER, length) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
      expectCleanHeaders(res);

      const stored = storedJob(item.id);
      expect(stored.status).toBe('emergency');
      expect(stored.urgency).toBe('emergency');
      expect(stored.isEmergency).toBe(true);
      const replies = stored.replies as Array<{ text: string }>;
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toHaveLength(500);
      expect(stored.replyCount).toBe(1);
    });

    it.each<JobStatus>(['accepted', 'declined', 'booked', 'info_requested', 'new'])(
      'a triggering reply is still 200 emergency for %s and the Job becomes emergency',
      async (status) => {
        const item = makeJobItem(status);
        seed(item);
        const res = await call(item.id, { text: TRIGGER });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
        expectCleanHeaders(res);
        expect(storedJob(item.id).status).toBe('emergency');
      },
    );

    it('is 200 emergency for an unknown UUID and creates nothing', async () => {
      const res = await call(UNKNOWN_ID, { text: TRIGGER });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
      expect(holder.fake.items.size).toBe(0);
    });

    it('is 200 emergency for a non-UUID with zero commands', async () => {
      const res = await call('not-a-uuid', { text: TRIGGER });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
      expectCleanHeaders(res);
      expect(holder.fake.calls).toHaveLength(0);
    });

    it('still returns 200 emergency when the override write fails', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      holder.fake.send = () => Promise.reject(Object.assign(new Error('boom'), { name: 'ThrottlingException' }));
      const res = await call(item.id, { text: TRIGGER });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
    });

    it('does not read before the Safety_Layer: a trigger issues no GetCommand', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      await call(item.id, { text: TRIGGER });
      expect(countOf('GetCommand')).toBe(0);
    });
  });

  describe('status conflicts', () => {
    it.each<JobStatus>(['accepted', 'declined'])('returns 409 ILLEGAL_TRANSITION with the status for %s', async (status) => {
      const item = makeJobItem(status);
      seed(item);
      const res = await call(item.id, { text: 'hello' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });

    it('returns 409 JOB_IS_EMERGENCY with the emergency message for an emergency Job', async () => {
      const item = makeJobItem('emergency');
      seed(item);
      const res = await call(item.id, { text: 'hello' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: 'JOB_IS_EMERGENCY',
        message: EMERGENCY_MESSAGE,
        status: 'emergency',
      });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });

    it('returns 429 REPLY_LIMIT_REACHED at replyCount 5', async () => {
      const replies = Array.from({ length: 5 }, (_, i) => ({ text: `reply ${i}`, at: '2026-03-05T11:00:00.000Z' }));
      const item = makeJobItem('info_requested', { replies, replyCount: 5 });
      seed(item);
      const res = await call(item.id, { text: 'one more' });
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ error: 'REPLY_LIMIT_REACHED' });
      expectCleanHeaders(res);
      expect(writeCalls()).toBe(0);
    });

    it('re-reads exactly once and does not write again when the condition fails', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      const fake = holder.fake;
      const realSend = fake.send;
      // Another request moves the Job to accepted just before our write lands.
      fake.send = async (command) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === 'UpdateCommand') {
          fake.seed({ ...makeJobItem('accepted', { id: item.id }) });
        }
        return realSend(command);
      };

      const res = await call(item.id, { text: 'hello' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: 'accepted' });
      expectCleanHeaders(res);
      expect(countOf('UpdateCommand')).toBe(1);
      expect(countOf('GetCommand')).toBe(2);
      expect((storedJob(item.id).replies as unknown[]).length).toBe(0);
    });
  });

  describe('failures and logging', () => {
    it('returns 500 ACTION_FAILED on a DynamoDB failure and logs no secret, cookie or reply text', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      const secret = 'super-secret-value-123';
      const replyText = 'my private reply text';
      const err = new Error(`boom ${secret} hhi_pro=abc ${replyText}`);
      err.name = 'ThrottlingException';
      holder.fake.send = () => Promise.reject(err);

      const res = await call(item.id, { text: replyText });
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: 'ACTION_FAILED' });
      expectCleanHeaders(res);

      const logged = spies.loggedText();
      expect(logged).toContain('ThrottlingException');
      expect(logged).not.toContain(secret);
      expect(logged).not.toContain('hhi_pro');
      expect(logged).not.toContain(replyText);
    });

    it('never writes a RATELIMIT# item', async () => {
      const item = makeJobItem('info_requested');
      seed(item);
      await call(item.id, { text: 'hello' });
      const serialized = JSON.stringify(holder.fake.calls);
      expect(serialized).not.toContain('RATELIMIT#');
    });
  });
});
