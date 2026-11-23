import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem } from '@/test/jobFixtures';
import { consoleSpies, forwardedFor, makeRequest, withEnv, type ConsoleSpies } from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { HELP_SUBJECT_EMERGENCY } from '@/lib/help/email';
import { resolveVisitorId } from '@/lib/rateLimiter';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({
  fake: null as unknown as FakeDynamoTable,
  /** Ordered log of 'check' (Safety_Layer ran), 'ses' and DynamoDB command names. */
  sequence: [] as string[],
  sesInputs: [] as Array<Record<string, unknown>>,
  sesFails: false,
}));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

vi.mock('@aws-sdk/client-sesv2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sesv2')>();
  class FakeSesClient {
    async send(command: { input: Record<string, unknown> }): Promise<Record<string, unknown>> {
      holder.sequence.push('ses');
      holder.sesInputs.push(command.input);
      if (holder.sesFails) {
        throw Object.assign(new Error('injected SES failure'), { name: 'MessageRejected' });
      }
      return {};
    }
  }
  return { ...actual, SESv2Client: FakeSesClient };
});

vi.mock('@/lib/safety/replyCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safety/replyCheck')>();
  return {
    ...actual,
    replyTriggersEmergency: vi.fn((text: string) => {
      holder.sequence.push('check');
      return actual.replyTriggersEmergency(text);
    }),
  };
});

import { POST } from './route';

const TRIGGERS: readonly string[] = [
  'I can smell gas in the kitchen',
  'There were sparks coming from the outlet',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
];

const TEXT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'.split('');
const HELP_LIMIT = 5;

type TriggerIn = 'message' | 'name' | 'both';
type Invalid = 'none' | 'email' | 'page' | 'side' | 'long';
type Failure = 'none' | 'counter' | 'put' | 'ses' | 'putAndSes' | 'all';

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    CONTACT_FROM_EMAIL: 'from@example.com',
    CONTACT_TO_EMAIL: 'to@example.com',
    SESSION_SECRET: undefined,
  });
  spies = consoleSpies();
});

afterEach(() => {
  restoreEnv();
  spies.restore();
});

function touchedKey(input: Record<string, unknown>): string | undefined {
  const key = (input.Key ?? input.Item) as { PK?: unknown } | undefined;
  return typeof key?.PK === 'string' ? key.PK : undefined;
}

function instrument(fake: FakeDynamoTable, failure: Failure): void {
  const realSend = fake.send;
  fake.send = async (command) => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
    holder.sequence.push(name);
    const pk = touchedKey(input) ?? '';
    const fails =
      failure === 'all' ||
      (name === 'UpdateCommand' && pk.startsWith('RATELIMIT#') && failure === 'counter') ||
      (name === 'PutCommand' && pk.startsWith('HELP#') && (failure === 'put' || failure === 'putAndSes'));
    if (fails) {
      throw Object.assign(new Error('injected failure'), { name: 'ThrottlingException' });
    }
    return realSend(command);
  };
}

function insertTrigger(base: string, trigger: string, position: number): string {
  const at = Math.min(position, base.length);
  return `${base.slice(0, at)} ${trigger} ${base.slice(at)}`;
}

function rateCount(fake: FakeDynamoTable, key: string): number {
  const item = fake.get(key);
  return typeof item?.count === 'number' ? item.count : 0;
}

interface RunInput {
  trigger: string;
  triggerIn: TriggerIn;
  base: string;
  position: number;
  invalid: Invalid;
  honeypot: unknown;
  limitReached: boolean;
  failure: Failure;
  useJobId: boolean;
}

async function runOnce(input: RunInput): Promise<void> {
  const { trigger, triggerIn, base, position, invalid, honeypot, limitReached, failure, useJobId } = input;
  holder.sequence.length = 0;
  holder.sesInputs.length = 0;
  holder.sesFails = failure === 'ses' || failure === 'putAndSes' || failure === 'all';
  holder.fake = createFakeDynamoTable({ allowRateLimitWrites: true });

  const job = makeJobItem('new');
  holder.fake.seed({ ...job });
  const jobBefore = holder.fake.get(`JOB#${job.id}`);

  const message =
    triggerIn === 'name'
      ? 'Please call me back about my job.'
      : insertTrigger(base, trigger, position);
  const body: Record<string, unknown> = {
    message: invalid === 'long' ? `${message}${'a'.repeat(1001)}` : message,
    email: invalid === 'email' ? 'not-an-email' : 'visitor@example.com',
    page: invalid === 'page' ? '/admin' : useJobId ? '/inspect' : '/',
    side: invalid === 'side' ? 'robot' : 'homeowner',
  };
  if (triggerIn !== 'message') body.name = trigger;
  if (useJobId) body.jobId = job.id;
  if (honeypot !== undefined) body.website = honeypot;

  const request = makeRequest('/api/help', {
    body,
    headers: { 'x-forwarded-for': forwardedFor('203.0.113.7') },
  });
  const counterKey = `RATELIMIT#help:${resolveVisitorId(request)}`;
  if (limitReached) {
    holder.fake.seed({
      PK: counterKey,
      SK: counterKey,
      count: HELP_LIMIT,
      windowStart: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  const countBefore = rateCount(holder.fake, counterKey);
  instrument(holder.fake, failure);

  const res = await POST(request);

  // Always 200 with exactly the Emergency_Message (12.1, 12.2, 12.5, 12.6, 12.7, 14.10, 14.11).
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });

  // The Safety_Layer check is logged before any DynamoDB or SES call (12.4, 21.1).
  expect(holder.sequence[0]).toBe('check');

  // No Job_Status change, and no command touches a Job (12.8).
  expect(holder.fake.get(`JOB#${job.id}`)).toEqual(jobBefore);
  for (const call of holder.fake.calls) {
    const pk = touchedKey(call.input) ?? '';
    expect(pk.startsWith('RATELIMIT#help:') || pk.startsWith('HELP#')).toBe(true);
  }

  const honeypotFilled = typeof honeypot === 'string' && honeypot.length > 0;
  const counterFails = failure === 'counter' || failure === 'all';
  const proceeds = !honeypotFilled && invalid === 'none' && !limitReached && !counterFails;
  const putFails = failure === 'put' || failure === 'putAndSes' || failure === 'all';

  const helpKeys = [...holder.fake.items.keys()].filter((k) => k.startsWith('HELP#'));
  const expectedRecords = proceeds && !putFails ? 1 : 0;
  expect(helpKeys).toHaveLength(expectedRecords);
  if (expectedRecords === 1) {
    const record = holder.fake.items.get(helpKeys[0]);
    expect(record?.emergency).toBe(true);
  }

  expect(holder.sesInputs).toHaveLength(proceeds ? 1 : 0);
  if (proceeds) {
    const content = holder.sesInputs[0].Content as { Simple: { Subject: { Data: string } } };
    expect(content.Simple.Subject.Data).toBe(HELP_SUBJECT_EMERGENCY);
    expect(holder.sesInputs[0].FromEmailAddress).toBe('from@example.com');
  }

  // One counter increment exactly when the message went on to be saved and sent.
  expect(rateCount(holder.fake, counterKey)).toBe(countBefore + (proceeds ? 1 : 0));
  const rateKeys = [...holder.fake.items.keys()].filter((k) => k.startsWith('RATELIMIT#'));
  for (const key of rateKeys) expect(key.startsWith('RATELIMIT#help:')).toBe(true);
}

describe('Property 2: Help messages are safety first (extends Property 3)', () => {
  // Feature: chat-and-help, Property 2: Help messages are safety first (extends Property 3)
  // **Validates: Requirements 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 12.8, 14.10, 14.11, 21.1, 21.7**
  it('holds for every trigger, honeypot, limit state, counter, table or SES failure and field validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TRIGGERS),
        fc.constantFrom<TriggerIn>('message', 'name', 'both'),
        fc.string({ unit: fc.constantFrom(...TEXT_CHARS), minLength: 0, maxLength: 800 }),
        fc.nat(900),
        fc.constantFrom<Invalid>('none', 'none', 'email', 'page', 'side', 'long'),
        fc.constantFrom<unknown>(undefined, undefined, '', 'x', 'http://spam.example', 42, null),
        fc.boolean(),
        fc.constantFrom<Failure>('none', 'none', 'counter', 'put', 'ses', 'putAndSes', 'all'),
        fc.boolean(),
        async (trigger, triggerIn, base, position, invalid, honeypot, limitReached, failure, useJobId) => {
          await runOnce({ trigger, triggerIn, base, position, invalid, honeypot, limitReached, failure, useJobId });
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  it('example: a trigger in the message saves one emergency record and sends one emergency email', async () => {
    await runOnce({
      trigger: TRIGGERS[0],
      triggerIn: 'message',
      base: 'Hello',
      position: 0,
      invalid: 'none',
      honeypot: undefined,
      limitReached: false,
      failure: 'none',
      useJobId: true,
    });
    expect([...holder.fake.items.keys()].filter((k) => k.startsWith('HELP#'))).toHaveLength(1);
    expect(holder.sesInputs).toHaveLength(1);
  }, 30_000);
});
