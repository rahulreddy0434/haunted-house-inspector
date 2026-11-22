import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeChatItem, makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { JOB_STATUSES, type JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The chat route must never touch the visitor inspection rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the chat route');
});

const holder = vi.hoisted(() => ({
  fake: null as unknown as FakeDynamoTable,
  /** Ordered log of 'check' (Safety_Layer ran) and DynamoDB command names. */
  sequence: [] as string[],
}));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
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

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';
const MAX_BODY_BYTES = 4096;

const TRIGGERS: readonly string[] = [
  'I can smell gas in the kitchen',
  'There were sparks coming from the outlet',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
];

const TEXT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'.split('');

type TargetKind = 'existing' | 'unknownUuid' | 'legacy' | 'nonUuid';
type Failure = 'none' | 'get' | 'update' | 'all';

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ DYNAMODB_TABLE_NAME: 'test-table' });
  spies = consoleSpies();
});

afterEach(() => {
  restoreEnv();
  spies.restore();
});

/** Logs every command in `holder.sequence`; throws for the commands selected by `failure`. */
function instrument(fake: FakeDynamoTable, failure: Failure): void {
  const realSend = fake.send;
  fake.send = async (command) => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    holder.sequence.push(name);
    const fails =
      failure === 'all' ||
      (failure === 'get' && name === 'GetCommand') ||
      (failure === 'update' && name === 'UpdateCommand');
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

function chatKeys(fake: FakeDynamoTable): string[] {
  return [...fake.items.keys()].filter((k) => k.includes('CHAT#')).sort();
}

interface RunInput {
  text: string;
  trigger: string;
  kind: TargetKind;
  status: JobStatus;
  threadSize: number;
  rateLimited: boolean;
  failure: Failure;
}

async function runOnce(input: RunInput): Promise<void> {
  const { text, trigger, kind, status, threadSize, rateLimited, failure } = input;
  holder.sequence.length = 0;
  holder.fake = createFakeDynamoTable();

  let id: string;
  let seeded = false;
  if (kind === 'existing') {
    const now = Date.now();
    const item = makeJobItem(status, {
      chatSeq: threadSize,
      chatLastAt: new Date(now - 1000).toISOString(),
      // A full Message_Rate_Limit window: 10 sends in the last minute.
      chatSentHomeowner: rateLimited ? Array.from({ length: 10 }, (_, i) => now - 1000 - i) : [],
      chatSentTradesperson: [],
    });
    holder.fake.seed({ ...item });
    for (let seq = 1; seq <= threadSize; seq += 1) {
      holder.fake.seed({ ...makeChatItem(item.id, seq) });
    }
    id = item.id;
    seeded = true;
  } else if (kind === 'legacy') {
    const legacy = makeLegacyJobItem();
    holder.fake.seed({ ...legacy });
    id = legacy.id as string;
    seeded = true;
  } else if (kind === 'unknownUuid') {
    id = UNKNOWN_ID;
  } else {
    id = 'not-a-uuid';
  }

  expect(Buffer.byteLength(JSON.stringify({ text }), 'utf8')).toBeLessThanOrEqual(MAX_BODY_BYTES);

  const chatBefore = chatKeys(holder.fake);
  const itemsBefore = holder.fake.items.size;
  instrument(holder.fake, failure);
  const res = await callWithId(POST, makeRequest(`/api/inspections/${id}/chat`, { body: { text } }), id);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });

  // The Safety_Layer ran first; no read, put or transaction happens at all.
  expect(holder.sequence[0]).toBe('check');
  expect(holder.sequence).not.toContain('GetCommand');
  expect(holder.sequence).not.toContain('PutCommand');
  expect(holder.sequence).not.toContain('TransactWriteCommand');
  expect(holder.sequence).not.toContain('QueryCommand');
  if (kind === 'nonUuid') {
    expect(holder.sequence).toEqual(['check']);
  }

  // No CHAT# item is written, and the Trigger text is in no stored attribute.
  expect(chatKeys(holder.fake)).toEqual(chatBefore);
  expect(holder.fake.items.size).toBe(itemsBefore);
  const stored = JSON.stringify([...holder.fake.items.values()]);
  expect(stored).not.toContain(trigger);
  expect(stored).not.toContain(text);

  if (seeded && failure !== 'all' && failure !== 'update') {
    const job = holder.fake.get(`JOB#${id}`);
    if (!job) throw new Error('job missing');
    expect(job.status).toBe('emergency');
    expect(job.urgency).toBe('emergency');
    expect(job.isEmergency).toBe(true);
    expect(job.costRangeLow).toBe(0);
    expect(job.costRangeHigh).toBe(0);
    expect(job.jobBrief).toBe('');
    expect(job.diySteps).toEqual([]);
    expect(job).not.toHaveProperty('offeredSlots');
    expect(job).not.toHaveProperty('bookedSlot');
    expect(job).not.toHaveProperty('bookedAt');
    if (kind === 'existing') expect(job.chatSeq).toBe(threadSize);
  }
  if (!seeded) {
    expect(holder.fake.items.size).toBe(0);
  }
}

describe('Property 1: Homeowner chat is safety first (extends Property 3)', () => {
  // Feature: chat-and-help, Property 1: Homeowner chat is safety first (extends Property 3)
  // **Validates: Requirements 4.1, 4.2, 4.3, 4.6, 4.8, 21.1**
  it('holds for every trigger, target, thread size, rate-limit state and DynamoDB failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TRIGGERS),
        fc.string({ unit: fc.constantFrom(...TEXT_CHARS), minLength: 0, maxLength: 3900 }),
        fc.nat(4000),
        fc.constantFrom<TargetKind>('existing', 'unknownUuid', 'legacy', 'nonUuid'),
        fc.constantFrom<JobStatus>(...JOB_STATUSES),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        fc.constantFrom<Failure>('none', 'get', 'update', 'all'),
        async (trigger, base, position, kind, status, threadSize, rateLimited, failure) => {
          const text = insertTrigger(base, trigger, position);
          await runOnce({ text, trigger, kind, status, threadSize, rateLimited, failure });
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  it('example: a full thread, a full rate window and a failing table', async () => {
    await runOnce({
      text: `Help, ${TRIGGERS[0]}`,
      trigger: TRIGGERS[0],
      kind: 'existing',
      status: 'booked',
      threadSize: 100,
      rateLimited: true,
      failure: 'all',
    });
  });
});
