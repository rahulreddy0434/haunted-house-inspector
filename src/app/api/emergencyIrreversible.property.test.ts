import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { applySafetyOverride } from '@/lib/aws/jobs';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  TEST_ACCESS_CODE,
  TEST_SECRET,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// None of these routes may touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the emergency routes');
});

const s3Spies = vi.hoisted(() => ({
  send: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  getDownloadPresignedUrl: vi.fn(),
}));
vi.mock('@/lib/aws/s3', () => ({
  s3Client: { send: s3Spies.send },
  getUploadPresignedUrl: s3Spies.getUploadPresignedUrl,
  getDownloadPresignedUrl: s3Spies.getDownloadPresignedUrl,
}));

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { GET as statusGET } from './inspections/[id]/status/route';
import { POST as replyPOST } from './inspections/[id]/reply/route';
import { POST as bookPOST } from './inspections/[id]/book/route';
import { GET as proDetailGET } from './pro/jobs/[id]/route';
import { POST as acceptPOST } from './pro/jobs/[id]/accept/route';
import { POST as declinePOST } from './pro/jobs/[id]/decline/route';
import { POST as askInfoPOST } from './pro/jobs/[id]/ask-info/route';

const JOB_ID = '55555555-5555-4555-8555-555555555555';
const HOUR_MS = 60 * 60 * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Letters without vowels a, e, i, o, u plus digits and spaces: never forms a trigger phrase. */
const SAFE_CHARS = 'bcdfhjklmnpqrtvwxyz0123456789 '.split('');
const safeText = (max: number): fc.Arbitrary<string> =>
  fc
    .string({ unit: fc.constantFrom(...SAFE_CHARS), maxLength: max - 1 })
    .map((s) => `k${s}`);

type Operation =
  | { kind: 'accept'; hours: number[] }
  | { kind: 'decline'; reason: string | undefined }
  | { kind: 'askInfo'; question: string }
  | { kind: 'reply'; text: string }
  | { kind: 'book'; slot: string }
  | { kind: 'statusRead' }
  | { kind: 'proRead' };

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant('accept' as const),
    hours: fc.uniqueArray(fc.integer({ min: 1, max: 30 * 24 }), { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('decline' as const),
    reason: fc.option(safeText(200), { nil: undefined }),
  }),
  fc.record({ kind: fc.constant('askInfo' as const), question: safeText(300) }),
  fc.record({ kind: fc.constant('reply' as const), text: safeText(500) }),
  fc.record({
    kind: fc.constant('book' as const),
    slot: fc.integer({ min: 1, max: 30 * 24 }).map((h) => iso(FIXTURE_NOW_MS + h * HOUR_MS)),
  }),
  fc.constant({ kind: 'statusRead' as const }),
  fc.constant({ kind: 'proRead' as const }),
);

interface Scenario {
  start: 'created' | JobStatus;
  /** Reply text passed to the override ('' skips straight to the reply-less attempt). */
  overrideReply: string;
  ops: Operation[];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  start: fc.constantFrom<'created' | JobStatus>('created', 'new', 'info_requested', 'accepted', 'declined', 'booked'),
  overrideReply: fc.constantFrom('', 'I can smell gas in the kitchen', 'There are sparks at the outlet'),
  ops: fc.array(operationArb, { minLength: 1, maxLength: 20 }),
});

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    S3_BUCKET_NAME: 'test-bucket',
    SESSION_SECRET: TEST_SECRET,
    PRO_ACCESS_CODE: TEST_ACCESS_CODE,
  });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
  s3Spies.send.mockReset();
  s3Spies.getUploadPresignedUrl.mockReset();
  s3Spies.getDownloadPresignedUrl.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

const FORBIDDEN_KEYS = ['offeredSlots', 'bookedSlot', 'bookedAt'];

function stored(): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${JOB_ID}`);
  if (!item) throw new Error('job missing');
  return item;
}

function proCookie(): string {
  return validProCookie(FIXTURE_NOW_MS);
}

async function run(op: Operation): Promise<{ res: Response; write: boolean; pro: boolean; slots: string[] }> {
  const path = `/api/inspections/${JOB_ID}`;
  const proPath = `/api/pro/jobs/${JOB_ID}`;
  switch (op.kind) {
    case 'accept': {
      const slots = op.hours.map((h) => iso(FIXTURE_NOW_MS + h * HOUR_MS));
      const req = makeRequest(`${proPath}/accept`, { body: { slots }, cookie: proCookie() });
      return { res: await callWithId(acceptPOST, req, JOB_ID), write: true, pro: true, slots };
    }
    case 'decline': {
      const body = op.reason === undefined ? {} : { reason: op.reason };
      const req = makeRequest(`${proPath}/decline`, { body, cookie: proCookie() });
      return { res: await callWithId(declinePOST, req, JOB_ID), write: true, pro: true, slots: [] };
    }
    case 'askInfo': {
      const req = makeRequest(`${proPath}/ask-info`, { body: { question: op.question }, cookie: proCookie() });
      return { res: await callWithId(askInfoPOST, req, JOB_ID), write: true, pro: true, slots: [] };
    }
    case 'reply': {
      const req = makeRequest(`${path}/reply`, { body: { text: op.text } });
      return { res: await callWithId(replyPOST, req, JOB_ID), write: true, pro: false, slots: [] };
    }
    case 'book': {
      const req = makeRequest(`${path}/book`, { body: { slot: op.slot } });
      return { res: await callWithId(bookPOST, req, JOB_ID), write: true, pro: false, slots: [op.slot] };
    }
    case 'statusRead': {
      const req = makeRequest(`${path}/status`);
      return { res: await callWithId(statusGET, req, JOB_ID), write: false, pro: false, slots: [] };
    }
    case 'proRead': {
      const req = makeRequest(proPath, { cookie: proCookie() });
      return { res: await callWithId(proDetailGET, req, JOB_ID), write: false, pro: true, slots: [] };
    }
  }
}

async function seedEmergency(start: Scenario['start'], overrideReply: string): Promise<string[]> {
  if (start === 'created') {
    holder.fake.seed({ ...makeJobItem('emergency', { id: JOB_ID }) });
    return [];
  }
  const item = makeJobItem(start, { id: JOB_ID });
  holder.fake.seed({ ...item });
  const priorSlots = [...(item.offeredSlots ?? []), ...(item.bookedSlot ? [item.bookedSlot] : [])];
  const outcome = await applySafetyOverride(JOB_ID, overrideReply, iso(FIXTURE_NOW_MS));
  expect(outcome).toBe('applied');
  return priorSlots;
}

describe('emergency stays emergency (route-level)', () => {
  // Feature: pro-dashboard-and-booking, Property 2: Emergency stays emergency, through every handler and every view
  // **Validates: Requirements 6.3, 7.11, 8.5, 9.11, 10.7, 11.3, 11.9, 11.13, 16.3**
  it('keeps status emergency and leaks no slot through any sequence of handler calls', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ start, overrideReply, ops }) => {
        holder.fake = createFakeDynamoTable();
        s3Spies.getDownloadPresignedUrl.mockReset();
        const priorSlots = await seedEmergency(start, overrideReply);
        const baseline = structuredClone(stored());
        expect(baseline.status).toBe('emergency');
        for (const key of FORBIDDEN_KEYS) expect(baseline).not.toHaveProperty(key);

        for (const op of ops) {
          const { res, write, pro, slots } = await run(op);
          const text = await res.text();
          const body = JSON.parse(text) as Record<string, unknown>;

          // No slot data in any response.
          for (const key of FORBIDDEN_KEYS) expect(text).not.toContain(key);
          for (const slot of [...priorSlots, ...slots]) expect(text).not.toContain(slot);

          if (write) {
            expect(res.status).toBe(409);
            expect(body).toEqual({
              error: 'JOB_IS_EMERGENCY',
              message: pro ? PRO_EMERGENCY_NOTE : EMERGENCY_MESSAGE,
              status: 'emergency',
            });
          } else if (op.kind === 'statusRead') {
            expect(res.status).toBe(200);
            expect(body).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
            expect(Object.keys(body).sort()).toEqual(['message', 'status']);
          } else {
            expect(res.status).toBe(200);
            expect(body.status).toBe('emergency');
          }

          // Stored job is untouched.
          expect(stored()).toEqual(baseline);
        }
        // Emergency Jobs never trigger photo signing.
        expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
