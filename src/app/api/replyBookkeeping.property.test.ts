import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
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
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// None of these routes may touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the reply and Pro routes');
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

import { POST as replyPOST } from './inspections/[id]/reply/route';
import { POST as acceptPOST } from './pro/jobs/[id]/accept/route';
import { POST as declinePOST } from './pro/jobs/[id]/decline/route';
import { POST as askInfoPOST } from './pro/jobs/[id]/ask-info/route';

const JOB_ID = '66666666-6666-4666-8666-666666666666';
const HOUR_MS = 60 * 60 * 1000;
const REPLY_LIMIT = 5;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Letters without the vowels a, e, i, o, u plus digits and spaces: never forms a trigger phrase. */
const SAFE_CHARS = 'bcdfhjklmnpqrtvwxyz0123456789 '.split('');
const safeText = (max: number): fc.Arbitrary<string> =>
  fc.string({ unit: fc.constantFrom(...SAFE_CHARS), maxLength: max - 1 }).map((s) => `k${s}`);

/** Trigger phrases taken from src/lib/safety/replyCheck.test.ts. */
const TRIGGERS = [
  'I can smell gas in the kitchen',
  'It smells like rotten eggs',
  'There were sparks coming from the outlet',
  'a burning smell near the panel and scorch marks',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
];

type Operation =
  | { kind: 'ask'; question: string }
  | { kind: 'reply'; text: string }
  | { kind: 'accept'; hours: number[] }
  | { kind: 'decline'; reason: string | undefined }
  | { kind: 'triggerReply'; text: string };

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  { weight: 8, arbitrary: fc.record({ kind: fc.constant('ask' as const), question: safeText(300) }) },
  { weight: 8, arbitrary: fc.record({ kind: fc.constant('reply' as const), text: safeText(500) }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('accept' as const),
      hours: fc.uniqueArray(fc.integer({ min: 1, max: 30 * 24 - 1 }), { minLength: 1, maxLength: 3 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('decline' as const),
      reason: fc.option(safeText(200), { nil: undefined }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('triggerReply' as const),
      text: fc.constantFrom(...TRIGGERS),
    }),
  },
);

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

function stored(): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${JOB_ID}`);
  if (!item) throw new Error('job missing');
  return item;
}

function lengthOf(value: unknown): number {
  if (!Array.isArray(value)) throw new Error('expected an array');
  return value.length;
}

async function send(op: Operation, nowMs: number): Promise<Response> {
  const proPath = `/api/pro/jobs/${JOB_ID}`;
  const cookie = validProCookie(FIXTURE_NOW_MS);
  switch (op.kind) {
    case 'ask':
      return callWithId(
        askInfoPOST,
        makeRequest(`${proPath}/ask-info`, { body: { question: op.question }, cookie }),
        JOB_ID,
      );
    case 'accept': {
      const slots = op.hours.map((h) => iso(nowMs + h * HOUR_MS));
      return callWithId(acceptPOST, makeRequest(`${proPath}/accept`, { body: { slots }, cookie }), JOB_ID);
    }
    case 'decline': {
      const body = op.reason === undefined ? {} : { reason: op.reason };
      return callWithId(declinePOST, makeRequest(`${proPath}/decline`, { body, cookie }), JOB_ID);
    }
    case 'reply':
    case 'triggerReply':
      return callWithId(
        replyPOST,
        makeRequest(`/api/inspections/${JOB_ID}/reply`, { body: { text: op.text } }),
        JOB_ID,
      );
  }
}

interface Model {
  status: JobStatus;
  replyCount: number;
  infoCount: number;
}

interface Expected {
  http: number;
  /** Fields that must appear in the JSON body. */
  body: Record<string, unknown>;
}

/** Applies one operation to the reference model and returns the expected HTTP outcome. */
function step(model: Model, op: Operation): Expected {
  const conflict = (error: string, status: number = 409): Expected => ({ http: status, body: { error } });
  const refusal = (): Expected =>
    model.status === 'emergency'
      ? { http: 409, body: { error: 'JOB_IS_EMERGENCY', status: 'emergency' } }
      : { http: 409, body: { error: 'ILLEGAL_TRANSITION', status: model.status } };
  const open = model.status === 'new' || model.status === 'info_requested';

  switch (op.kind) {
    case 'ask':
      if (model.status !== 'new') return refusal();
      if (model.replyCount >= REPLY_LIMIT) return conflict('REPLY_LIMIT_REACHED');
      model.status = 'info_requested';
      model.infoCount += 1;
      return { http: 200, body: { status: 'info_requested' } };
    case 'accept':
      if (!open) return refusal();
      model.status = 'accepted';
      return { http: 200, body: { status: 'accepted' } };
    case 'decline':
      if (!open) return refusal();
      model.status = 'declined';
      return { http: 200, body: { status: 'declined' } };
    case 'reply':
      if (model.status !== 'info_requested') return refusal();
      if (model.replyCount >= REPLY_LIMIT) return conflict('REPLY_LIMIT_REACHED', 429);
      model.status = 'new';
      model.replyCount += 1;
      return { http: 200, body: { status: 'new' } };
    case 'triggerReply':
      if (model.status !== 'emergency') {
        model.status = 'emergency';
        if (model.replyCount < REPLY_LIMIT) model.replyCount += 1;
      }
      return { http: 200, body: { status: 'emergency' } };
  }
}

describe('reply bookkeeping', () => {
  // Feature: pro-dashboard-and-booking, Property 12: Reply bookkeeping stays consistent
  // **Validates: Requirements 6.12, 6.18, 7.9, 9.8, 9.9, 11.1, 12.1, 12.11, 12.13**
  it('keeps replyCount, replies, infoRequests, ttl and statusUpdatedAt consistent through any sequence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(operationArb, { minLength: 1, maxLength: 30 }), async (ops) => {
        holder.fake = createFakeDynamoTable();
        vi.setSystemTime(FIXTURE_NOW_MS);
        holder.fake.seed({ ...makeJobItem('new', { id: JOB_ID }) });
        const initialTtl = stored().ttl;
        const model: Model = { status: 'new', replyCount: 0, infoCount: 0 };

        for (const [index, op] of ops.entries()) {
          const nowMs = FIXTURE_NOW_MS + (index + 1) * 1000;
          vi.setSystemTime(nowMs);
          const before = stored();
          const modelBefore = { ...model };

          const res = await send(op, nowMs);
          const expected = step(model, op);

          // HTTP response against the reference model.
          expect(res.status).toBe(expected.http);
          expect(await res.json()).toMatchObject(expected.body);

          const after = stored();
          const replies = lengthOf(after.replies);
          expect(after.replyCount).toBe(replies);
          expect(replies).toBeLessThanOrEqual(REPLY_LIMIT);
          expect(lengthOf(after.infoRequests)).toBeLessThanOrEqual(REPLY_LIMIT);
          expect(after.ttl).toBe(initialTtl);

          // Stored state against the reference model.
          expect(after.status).toBe(model.status);
          expect(after.replyCount).toBe(model.replyCount);
          expect(lengthOf(after.infoRequests)).toBe(model.infoCount);

          // statusUpdatedAt changes exactly when status changes.
          const statusChanged = after.status !== before.status;
          expect(statusChanged).toBe(modelBefore.status !== model.status);
          expect(after.statusUpdatedAt !== before.statusUpdatedAt).toBe(statusChanged);
          if (statusChanged) expect(after.statusUpdatedAt).toBe(iso(nowMs));

          // A refused or non-triggering call never stores a reply beyond the limit.
          if (op.kind === 'reply') {
            expect(replies).toBe(res.status === 200 ? modelBefore.replyCount + 1 : modelBefore.replyCount);
          }
          if (op.kind === 'ask' && modelBefore.status === 'new' && modelBefore.replyCount >= REPLY_LIMIT) {
            expect(res.status).toBe(409);
            expect(after.status).toBe('new');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('refuses ask-info with REPLY_LIMIT_REACHED once five replies are stored on a new Job', async () => {
    holder.fake.seed({ ...makeJobItem('new', { id: JOB_ID }) });
    for (let i = 0; i < REPLY_LIMIT; i += 1) {
      vi.setSystemTime(FIXTURE_NOW_MS + (2 * i + 1) * 1000);
      expect((await send({ kind: 'ask', question: 'kq' }, FIXTURE_NOW_MS)).status).toBe(200);
      vi.setSystemTime(FIXTURE_NOW_MS + (2 * i + 2) * 1000);
      expect((await send({ kind: 'reply', text: 'kr' }, FIXTURE_NOW_MS)).status).toBe(200);
    }
    expect(stored().replyCount).toBe(REPLY_LIMIT);

    const res = await send({ kind: 'ask', question: 'kq' }, FIXTURE_NOW_MS);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'REPLY_LIMIT_REACHED' });
    expect(stored().status).toBe('new');
    expect(lengthOf(stored().infoRequests)).toBe(REPLY_LIMIT);
  });
});
