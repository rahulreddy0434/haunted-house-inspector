import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeChatItem, makeJobItem } from '@/test/jobFixtures';
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

// The chat routes must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the chat routes');
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

import { GET as homeownerChatGET, POST as homeownerChatPOST } from './inspections/[id]/chat/route';
import { GET as proChatGET, POST as proChatPOST } from './pro/jobs/[id]/chat/route';
import { POST as acceptPOST } from './pro/jobs/[id]/accept/route';
import { POST as declinePOST } from './pro/jobs/[id]/decline/route';
import { POST as askInfoPOST } from './pro/jobs/[id]/ask-info/route';

const JOB_ID = '66666666-6666-4666-8666-666666666666';
const HOUR_MS = 60 * 60 * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();

type Side = 'homeowner' | 'tradesperson';

/** Letters without vowels a, e, i, o, u plus digits and spaces: never forms a trigger phrase. */
const SAFE_CHARS = 'bcdfhjklmnpqrtvwxyz0123456789 '.split('');
const safeText = (max: number): fc.Arbitrary<string> =>
  fc.string({ unit: fc.constantFrom(...SAFE_CHARS), maxLength: max - 1 }).map((s) => `k${s}`);

const TRIGGER_TEXTS = [
  'I can smell gas in the kitchen',
  'There are sparks at the outlet',
  'The carbon monoxide alarm is going off',
  'Water is flooding near the electrical panel',
];

const sideArb = fc.constantFrom<Side>('homeowner', 'tradesperson');

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

function chatItemCount(): number {
  return [...holder.fake.items.keys()].filter((k) => k.includes('|CHAT#')).length;
}

function proCookie(): string {
  return validProCookie(FIXTURE_NOW_MS);
}

function sendChat(side: Side, text: string): Promise<Response> {
  const path = side === 'homeowner' ? `/api/inspections/${JOB_ID}/chat` : `/api/pro/jobs/${JOB_ID}/chat`;
  const request = makeRequest(path, {
    body: { text },
    ...(side === 'tradesperson' ? { cookie: proCookie() } : {}),
  });
  return callWithId(side === 'homeowner' ? homeownerChatPOST : proChatPOST, request, JOB_ID);
}

function readChat(side: Side, after?: number): Promise<Response> {
  const base = side === 'homeowner' ? `/api/inspections/${JOB_ID}/chat` : `/api/pro/jobs/${JOB_ID}/chat`;
  const path = after === undefined ? base : `${base}?after=${after}`;
  const request = makeRequest(path, side === 'tradesperson' ? { cookie: proCookie() } : {});
  return callWithId(side === 'homeowner' ? homeownerChatGET : proChatGET, request, JOB_ID);
}

type Operation =
  | { kind: 'send'; side: Side; text: string }
  | { kind: 'trigger'; text: string }
  | { kind: 'accept'; hours: number[] }
  | { kind: 'decline' }
  | { kind: 'askInfo'; question: string }
  | { kind: 'read'; side: Side };

const operationArb: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant('send' as const),
    side: sideArb,
    text: fc.oneof(safeText(500), fc.constantFrom(...TRIGGER_TEXTS)),
  }),
  fc.record({ kind: fc.constant('trigger' as const), text: fc.constantFrom(...TRIGGER_TEXTS) }),
  fc.record({
    kind: fc.constant('accept' as const),
    hours: fc.uniqueArray(fc.integer({ min: 1, max: 30 * 24 }), { minLength: 1, maxLength: 3 }),
  }),
  fc.constant({ kind: 'decline' as const }),
  fc.record({ kind: fc.constant('askInfo' as const), question: safeText(300) }),
  fc.record({ kind: fc.constant('read' as const), side: sideArb }),
);

async function runOp(op: Operation): Promise<Response> {
  const proPath = `/api/pro/jobs/${JOB_ID}`;
  switch (op.kind) {
    case 'send':
      return sendChat(op.side, op.text);
    case 'trigger':
      return sendChat('homeowner', op.text);
    case 'accept': {
      const slots = op.hours.map((h) => iso(FIXTURE_NOW_MS + h * HOUR_MS));
      return callWithId(acceptPOST, makeRequest(`${proPath}/accept`, { body: { slots }, cookie: proCookie() }), JOB_ID);
    }
    case 'decline':
      return callWithId(declinePOST, makeRequest(`${proPath}/decline`, { body: {}, cookie: proCookie() }), JOB_ID);
    case 'askInfo':
      return callWithId(
        askInfoPOST,
        makeRequest(`${proPath}/ask-info`, { body: { question: op.question }, cookie: proCookie() }),
        JOB_ID,
      );
    case 'read':
      return readChat(op.side);
  }
}

describe('a closed chat stays closed (route-level)', () => {
  // Feature: chat-and-help, Property 5: A closed chat stays closed
  // **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 21.6**
  it('refuses every non-Trigger send on a declined or emergency Job and saves nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<JobStatus>('declined', 'emergency'),
        sideArb,
        safeText(500),
        async (status, side, text) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({ ...makeJobItem(status, { id: JOB_ID }) });
          const baseline = structuredClone(stored());

          const res = await sendChat(side, text);
          const body = (await res.json()) as Record<string, unknown>;

          expect(res.status).toBe(409);
          if (status === 'declined') {
            expect(body.error).toBe('ILLEGAL_TRANSITION');
          } else {
            expect(body.error).toBe('JOB_IS_EMERGENCY');
            expect(body.message).toBe(side === 'homeowner' ? EMERGENCY_MESSAGE : PRO_EMERGENCY_NOTE);
          }
          expect(chatItemCount()).toBe(0);
          expect(stored()).toEqual(baseline);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: chat-and-help, Property 5: A closed chat stays closed
  // **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 21.6**
  it('answers reads of an emergency Job with 409 and no message', async () => {
    await fc.assert(
      fc.asyncProperty(
        sideArb,
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        fc.integer({ min: 0, max: 5 }),
        async (side, after, seeded) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({ ...makeJobItem('emergency', { id: JOB_ID, chatSeq: seeded }) });
          for (let seq = 1; seq <= seeded; seq += 1) {
            holder.fake.seed({ ...makeChatItem(JOB_ID, seq, { text: `stored message number ${seq}` }) });
          }

          const res = await readChat(side, after);
          const text = await res.text();
          const body = JSON.parse(text) as Record<string, unknown>;

          expect(res.status).toBe(409);
          expect(body.error).toBe('JOB_IS_EMERGENCY');
          expect(body.message).toBe(side === 'homeowner' ? EMERGENCY_MESSAGE : PRO_EMERGENCY_NOTE);
          expect(body).not.toHaveProperty('messages');
          expect(text).not.toContain('stored message number');
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // Feature: chat-and-help, Property 5: A closed chat stays closed
  // **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 21.6**
  it('keeps an emergency Job in emergency through any sequence of sends, Trigger sends and Pro actions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'emergency' | JobStatus>('emergency', 'new', 'info_requested', 'accepted', 'declined', 'booked'),
        fc.constantFrom(...TRIGGER_TEXTS),
        fc.array(operationArb, { minLength: 1, maxLength: 15 }),
        async (start, firstTrigger, ops) => {
          holder.fake = createFakeDynamoTable();
          holder.fake.seed({ ...makeJobItem(start, { id: JOB_ID }) });

          // A Trigger from the Homeowner makes any Job an emergency Job.
          const first = await sendChat('homeowner', firstTrigger);
          expect(first.status).toBe(200);
          expect(await first.json()).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
          expect(stored().status).toBe('emergency');
          const chatBefore = chatItemCount();

          for (const op of ops) {
            const before = structuredClone(stored());
            const res = await runOp(op);
            const body = (await res.json()) as Record<string, unknown>;

            // A Homeowner message with a Trigger is a Trigger send, whichever way it was generated.
            const isTriggerSend =
              op.kind === 'trigger' ||
              (op.kind === 'send' && op.side === 'homeowner' && TRIGGER_TEXTS.includes(op.text));
            if (isTriggerSend) {
              expect(res.status).toBe(200);
              expect(body).toEqual({ status: 'emergency', message: EMERGENCY_MESSAGE });
            } else {
              expect(res.status).toBe(409);
              expect(body.error).toBe('JOB_IS_EMERGENCY');
              expect(body).not.toHaveProperty('messages');
              expect(stored()).toEqual(before);
            }
            expect(stored().status).toBe('emergency');
            expect(chatItemCount()).toBe(chatBefore);
          }

          // chatAccess stays closed: both Sides still get 409 on a read.
          for (const side of ['homeowner', 'tradesperson'] as const) {
            const res = await readChat(side);
            expect(res.status).toBe(409);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
