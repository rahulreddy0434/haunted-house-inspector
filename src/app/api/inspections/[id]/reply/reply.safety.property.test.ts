import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { emergencyReasonSentence } from '@/lib/emergency/reasons';
import { emergencyRuleFor } from '@/lib/emergency/ruleWrapper';
import { storedJobSchema } from '@/lib/validation/jobSchema';
import { JOB_STATUSES, type JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The reply route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the reply route');
});

const holder = vi.hoisted(() => ({
  fake: null as unknown as FakeDynamoTable,
  /** Ordered log of 'check' (checkEmergency ran) and DynamoDB command names. */
  sequence: [] as string[],
}));

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

vi.mock('@/lib/safety/safetyLayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/safety/safetyLayer')>();
  return {
    ...actual,
    checkEmergency: vi.fn((input: Parameters<typeof actual.checkEmergency>[0]) => {
      holder.sequence.push('check');
      return actual.checkEmergency(input);
    }),
  };
});

import { POST } from './route';

const UNKNOWN_ID = '11111111-2222-4333-8444-555555555555';
const MAX_BODY_BYTES = 4096;

// The four trigger phrases, one per condition code (from src/lib/safety/replyCheck.test.ts).
const TRIGGERS: ReadonlyArray<readonly [string, string]> = [
  ['GAS_SMELL', 'I can smell gas in the kitchen'],
  ['ELECTRICAL_FIRE', 'There were sparks coming from the outlet'],
  ['WATER_ELECTRICAL', 'Water is flooding near the electrical panel'],
  ['CO_ALARM', 'The carbon monoxide alarm is going off'],
];

const TEXT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'.split('');

type TargetKind = 'existing' | 'unknownUuid' | 'legacy' | 'nonUuid';

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

/** Wraps the fake's send so every command is logged in `holder.sequence`; optionally throws on UpdateCommand. */
function instrument(fake: FakeDynamoTable, failWrites: boolean): void {
  const realSend = fake.send;
  fake.send = async (command) => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    holder.sequence.push(name);
    if (failWrites && name === 'UpdateCommand') {
      throw Object.assign(new Error('write failed'), { name: 'ThrottlingException' });
    }
    return realSend(command);
  };
}

function insertTrigger(base: string, trigger: string, position: number): string {
  const at = Math.min(position, base.length);
  return `${base.slice(0, at)} ${trigger} ${base.slice(at)}`;
}

interface RunInput {
  text: string;
  kind: TargetKind;
  status: JobStatus;
  replyCount: number;
  writeFails: boolean;
}

async function runOnce(input: RunInput): Promise<void> {
  const { text, kind, status, replyCount, writeFails } = input;
  // Computed before the sequence is reset: emergencyRuleFor calls the spied checkEmergency.
  const expectedSentence = emergencyReasonSentence(emergencyRuleFor(text).rule);
  holder.sequence.length = 0;
  holder.fake = createFakeDynamoTable();

  let id: string;
  let seeded = false;
  if (kind === 'existing') {
    const replies = Array.from({ length: replyCount }, (_, i) => ({
      text: `earlier reply ${i}`,
      at: '2026-03-05T11:00:00.000Z',
    }));
    const item = makeJobItem(status, { replies, replyCount });
    expect(storedJobSchema.safeParse(item).success).toBe(true);
    holder.fake.seed({ ...item });
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

  const bodyBytes = Buffer.byteLength(JSON.stringify({ text }), 'utf8');
  expect(bodyBytes).toBeLessThanOrEqual(MAX_BODY_BYTES);

  instrument(holder.fake, writeFails);
  const res = await callWithId(POST, makeRequest(`/api/inspections/${id}/reply`, { body: { text } }), id);

  expect(res.status).toBe(200);
  // The sentence comes from the rule that fires on this exact (random) text, so it is computed, not fixed.
  expect(await res.json()).toEqual({
    status: 'emergency',
    message: EMERGENCY_MESSAGE,
    reasonSentence: expectedSentence,
  });

  // The Safety_Layer ran first; no read ever happens; no write precedes the check.
  expect(holder.sequence[0]).toBe('check');
  expect(holder.sequence).not.toContain('GetCommand');
  if (kind === 'nonUuid') {
    // Since task 3.3 the route runs the check twice (decision, then the rule wrapper). Still no DynamoDB command.
    expect(holder.sequence.length).toBeGreaterThanOrEqual(1);
    expect(holder.sequence.every((entry) => entry === 'check')).toBe(true);
    expect(holder.sequence.filter((entry) => entry.endsWith('Command'))).toEqual([]);
  }

  if (seeded && !writeFails) {
    const stored = holder.fake.get(`JOB#${id}`);
    if (!stored) throw new Error('job missing');
    expect(stored.status).toBe('emergency');
    expect(stored.urgency).toBe('emergency');
    expect(stored.isEmergency).toBe(true);
    expect(stored.costRangeLow).toBe(0);
    expect(stored.costRangeHigh).toBe(0);
    expect(stored.jobBrief).toBe('');
    expect(stored.diySteps).toEqual([]);
    expect(stored).not.toHaveProperty('offeredSlots');
    expect(stored).not.toHaveProperty('bookedSlot');
    expect(stored).not.toHaveProperty('bookedAt');
    const replies = (stored.replies as unknown[] | undefined) ?? [];
    expect(stored.replyCount).toBe(replies.length);
    expect(replies.length).toBeLessThanOrEqual(5);
  }
  if (!seeded) {
    expect(holder.fake.items.size).toBe(0);
  }
}

describe('Property 3: Any triggering reply ends in emergency, whatever the state', () => {
  // Feature: pro-dashboard-and-booking, Property 3: Any triggering reply ends in emergency, whatever the state
  // **Validates: Requirements 6.13, 9.3, 9.4, 9.5, 9.6, 9.7, 11.1, 11.2, 11.4, 11.5, 11.12, 16.4**
  it('holds for every trigger, status, replyCount, target and write outcome', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TRIGGERS),
        fc.string({ unit: fc.constantFrom(...TEXT_CHARS), minLength: 0, maxLength: 3900 }),
        fc.nat(4000),
        fc.constantFrom<TargetKind>('existing', 'unknownUuid', 'legacy', 'nonUuid'),
        fc.constantFrom<JobStatus>(...JOB_STATUSES),
        fc.integer({ min: 0, max: 5 }),
        fc.boolean(),
        async ([, trigger], base, position, kind, status, replyCount, writeFails) => {
          const text = insertTrigger(base, trigger, position);
          await runOnce({ text, kind, status, replyCount, writeFails });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: a trigger inside a text of about 4,000 bytes', async () => {
    const text = insertTrigger('a'.repeat(3950), TRIGGERS[0][1], 2000);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(3900);
    await runOnce({ text, kind: 'existing', status: 'info_requested', replyCount: 2, writeFails: false });
  });

  it('example: a trigger inside a text of 600 characters', async () => {
    const text = insertTrigger('b'.repeat(560), TRIGGERS[3][1], 100);
    expect(text.length).toBeGreaterThan(500);
    await runOnce({ text, kind: 'existing', status: 'booked', replyCount: 5, writeFails: false });
  });
});
