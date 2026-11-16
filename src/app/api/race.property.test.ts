import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  callWithId,
  consoleSpies,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// None of these routes may touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the race routes');
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

import { POST as accept } from '@/app/api/pro/jobs/[id]/accept/route';
import { POST as decline } from '@/app/api/pro/jobs/[id]/decline/route';
import { POST as askInfo } from '@/app/api/pro/jobs/[id]/ask-info/route';
import { POST as reply } from '@/app/api/inspections/[id]/reply/route';
import { POST as book } from '@/app/api/inspections/[id]/book/route';

const JOB_ID = '22222222-2222-4222-8222-222222222222';
const DAY_MS = 24 * 60 * 60 * 1000;
const NUM_RUNS = 100;

type OtherKind = 'accept' | 'decline' | 'ask_info' | 'reply' | 'book';

interface OpPayload {
  slots: string[];
  reason: string | undefined;
  question: string;
  replyText: string;
  bookSlot: string;
}

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
  // Only Date is faked so the fake table's promise-based hold/release keeps working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

// ── helpers ─────────────────────────────────────────────────────────────────
function resetTable(status: JobStatus): string[] {
  holder.fake = createFakeDynamoTable();
  const item = makeJobItem(status, { id: JOB_ID });
  holder.fake.seed({ ...item });
  return item.offeredSlots ?? [];
}

function proPost(
  handler: typeof accept,
  action: string,
  body: unknown,
): Promise<Response> {
  const request = makeRequest(`/api/pro/jobs/${JOB_ID}/${action}`, {
    method: 'POST',
    body,
    cookie: validProCookie(FIXTURE_NOW_MS),
  });
  return callWithId(handler, request, JOB_ID);
}

function homeownerPost(handler: typeof reply, action: string, body: unknown): Promise<Response> {
  return callWithId(handler, makeRequest(`/api/inspections/${JOB_ID}/${action}`, { method: 'POST', body }), JOB_ID);
}

function fire(kind: OtherKind, p: OpPayload): Promise<Response> {
  switch (kind) {
    case 'accept':
      return proPost(accept, 'accept', { slots: p.slots });
    case 'decline':
      return proPost(decline, 'decline', p.reason === undefined ? {} : { reason: p.reason });
    case 'ask_info':
      return proPost(askInfo, 'ask-info', { question: p.question });
    case 'reply':
      return homeownerPost(reply, 'reply', { text: p.replyText });
    case 'book':
      return homeownerPost(book, 'book', { slot: p.bookSlot });
  }
}

function fireOverride(text: string): Promise<Response> {
  return homeownerPost(reply, 'reply', { text });
}

async function waitForHeld(count: number): Promise<void> {
  for (let i = 0; i < 400 && holder.fake.heldCount() < count; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  expect(holder.fake.heldCount()).toBe(count);
}

/**
 * Starts the requests in order. Each handler reads the Job and then parks on its
 * UpdateCommand; the fake releases waiters in arrival order, so call order is
 * the write order. Both handlers have read before either write runs.
 */
async function race(thunks: Array<() => Promise<Response>>): Promise<Response[]> {
  holder.fake.hold('UpdateCommand');
  const pending: Promise<Response>[] = [];
  for (const thunk of thunks) {
    pending.push(thunk());
    await waitForHeld(pending.length);
  }
  holder.fake.release();
  return Promise.all(pending);
}

function updateCount(): number {
  return holder.fake.calls.filter((c) => c.name === 'UpdateCommand').length;
}

function stored(): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${JOB_ID}`);
  if (!item) throw new Error('job missing');
  return item;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// ── arbitraries ─────────────────────────────────────────────────────────────
const slotsArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 3 })
  .map((days) => days.sort((a, b) => a - b).map((d) => new Date(FIXTURE_NOW_MS + d * DAY_MS).toISOString()));

const safeText = fc.constantFrom(
  'Yes, it drips all day',
  'Only after it rains',
  'About three weeks now',
  'The stain is getting bigger',
);

const payloadArb: fc.Arbitrary<OpPayload> = fc.record({
  slots: slotsArb,
  reason: fc.option(safeText, { nil: undefined }),
  question: safeText,
  replyText: safeText,
  // Replaced per scenario with an offered slot.
  bookSlot: fc.constant(''),
});

const triggerArb = fc.constantFrom(
  'I can smell gas in the kitchen',
  'It smells like rotten eggs',
  'The carbon monoxide alarm is going off',
  'There were sparks coming from the outlet',
);

describe('Racing actions have exactly one winner', () => {
  // Feature: pro-dashboard-and-booking, Property 11: Racing actions have exactly one winner
  // **Validates: Requirements 6.9, 6.10, 6.11, 9.10, 10.6, 10.7, 11.15, 16.9, 16.20**

  it('(a) a reply racing accept or decline on one info_requested Job has one winner', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          other: fc.constantFrom<'accept' | 'decline'>('accept', 'decline'),
          replyFirst: fc.boolean(),
          payload: payloadArb,
        }),
        async ({ other, replyFirst, payload }) => {
          resetTable('info_requested');
          const replyOp = () => fire('reply', payload);
          const otherOp = () => fire(other, payload);
          const [first, second] = replyFirst ? [replyOp, otherOp] : [otherOp, replyOp];

          const results = await race([first, second]);

          expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
          // The first released request wins.
          expect(results[0].status).toBe(200);
          const winnerStatus = replyFirst ? 'new' : other === 'accept' ? 'accepted' : 'declined';
          expect(stored().status).toBe(winnerStatus);
          expect((await json(results[0])).status).toBe(winnerStatus);
          expect(await json(results[1])).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: winnerStatus });
          // One write attempt each; the loser never retries.
          expect(updateCount()).toBe(2);
          const replyCount = stored().replyCount;
          expect(replyCount).toBe(replyFirst ? 1 : 0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('(b) two bookings of one accepted Job have one winner', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }), async (i, j) => {
        const offered = resetTable('accepted');
        const payload: OpPayload = { slots: [], reason: undefined, question: '', replyText: '', bookSlot: '' };
        const results = await race([
          () => fire('book', { ...payload, bookSlot: offered[i] }),
          () => fire('book', { ...payload, bookSlot: offered[j] }),
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(results[0].status).toBe(200);
        expect(await json(results[0])).toEqual({ status: 'booked', bookedSlot: offered[i] });
        expect(await json(results[1])).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: 'booked' });
        expect(stored().status).toBe('booked');
        expect(stored().bookedSlot).toBe(offered[i]);
        expect(updateCount()).toBe(2);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('(c) a safety override racing any other action always ends in emergency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          other: fc.constantFrom<OtherKind>('accept', 'decline', 'ask_info', 'reply', 'book'),
          fromInfoRequested: fc.boolean(),
          overrideFirst: fc.boolean(),
          trigger: triggerArb,
          payload: payloadArb,
        }),
        async ({ other, fromInfoRequested, overrideFirst, trigger, payload }) => {
          const start: JobStatus =
            other === 'reply'
              ? 'info_requested'
              : other === 'book'
                ? 'accepted'
                : other === 'ask_info'
                  ? 'new'
                  : fromInfoRequested
                    ? 'info_requested'
                    : 'new';
          const offered = resetTable(start);
          const otherOp = () => fire(other, { ...payload, bookSlot: offered[0] ?? '' });
          const overrideOp = () => fireOverride(trigger);
          const ordered = overrideFirst ? [overrideOp, otherOp] : [otherOp, overrideOp];

          const results = await race(ordered);
          const overrideRes = results[overrideFirst ? 0 : 1];
          const otherRes = results[overrideFirst ? 1 : 0];

          // The triggering reply always answers 200 emergency.
          expect(overrideRes.status).toBe(200);
          expect((await json(overrideRes)).status).toBe('emergency');

          if (overrideFirst) {
            expect(otherRes.status).toBe(409);
            expect(await json(otherRes)).toMatchObject({ error: 'JOB_IS_EMERGENCY', status: 'emergency' });
          } else {
            // The other request won the race, then the override replaced its result.
            expect(otherRes.status).toBe(200);
          }

          const after = stored();
          expect(after.status).toBe('emergency');
          expect(after.urgency).toBe('emergency');
          expect(after.isEmergency).toBe(true);
          expect(after.offeredSlots).toBeUndefined();
          expect(after.bookedSlot).toBeUndefined();
          expect(after.bookedAt).toBeUndefined();

          // One write attempt for the other request; attempt A of the override succeeds here.
          expect(updateCount()).toBe(2);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
