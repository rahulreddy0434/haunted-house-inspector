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
import { statusAfterSend } from '@/lib/chat/rules';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { JOB_STATUSES, type JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the Pro routes');
});

const safetySpies = vi.hoisted(() => ({
  checkEmergency: vi.fn(),
  replyTriggersEmergency: vi.fn(),
}));
vi.mock('@/lib/safety/safetyLayer', () => ({ checkEmergency: safetySpies.checkEmergency }));
vi.mock('@/lib/safety/replyCheck', () => ({ replyTriggersEmergency: safetySpies.replyTriggersEmergency }));

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

import { GET, POST } from './route';

const JOB_ID = '33333333-3333-4333-8333-333333333333';

// Trigger phrases, as in src/lib/safety/replyCheck.test.ts.
const TRIGGER_PHRASES = [
  'I can smell gas in the kitchen',
  'It smells like rotten eggs',
  'There were sparks coming from the outlet',
  'a burning smell near the panel and scorch marks',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
  'our CO alarm beeped',
] as const;

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
  safetySpies.checkEmergency.mockReset();
  safetySpies.replyTriggersEmergency.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

// ── helpers shared by every property in this file ───────────────────────────

const CHAT_URL = `/api/pro/jobs/${JOB_ID}/chat`;

/** Starts each property iteration with one stored Job in `status` and no chat messages. */
function freshJob(status: JobStatus): void {
  holder.fake = createFakeDynamoTable();
  holder.fake.seed({ ...makeJobItem(status, { id: JOB_ID }) });
}

function proPost(body: unknown, cookie: string | undefined = validProCookie(FIXTURE_NOW_MS)): Promise<Response> {
  return callWithId(POST, makeRequest(CHAT_URL, { method: 'POST', body, cookie }), JOB_ID);
}

function proGet(cookie: string | undefined = validProCookie(FIXTURE_NOW_MS)): Promise<Response> {
  return callWithId(GET, makeRequest(CHAT_URL, { method: 'GET', cookie }), JOB_ID);
}

function storedJob(): Record<string, unknown> | undefined {
  return holder.fake.get(`JOB#${JOB_ID}`);
}

function storedChatItems(): Record<string, unknown>[] {
  return [...holder.fake.items.values()].filter(
    (item) => item.PK === `JOB#${JOB_ID}` && typeof item.SK === 'string' && item.SK.startsWith('CHAT#'),
  );
}

function expectSafetyUntouched(): void {
  expect(safetySpies.checkEmergency).not.toHaveBeenCalled();
  expect(safetySpies.replyTriggersEmergency).not.toHaveBeenCalled();
}

/** Free text that is sometimes plain, sometimes built around a trigger phrase. */
function mixedText(maxLength: number): fc.Arbitrary<string> {
  const plain = fc.string({ maxLength: Math.min(maxLength, 120) });
  const withPhrase = fc
    .tuple(fc.string({ maxLength: 30 }), fc.constantFrom(...TRIGGER_PHRASES), fc.string({ maxLength: 30 }))
    .map((parts) => parts.join(' '));
  return fc.oneof(plain, withPhrase, fc.constantFrom(...TRIGGER_PHRASES));
}

/** Text the schema accepts: 1 to 500 characters after trimming. */
const validChatText = fc.oneof(
  mixedText(500),
  fc.string({ minLength: 450, maxLength: 520 }),
).filter((s) => s.trim().length >= 1 && s.trim().length <= 500);

// ── Property 3 ──────────────────────────────────────────────────────────────

describe('Property 3: Pro chat messages never touch safety state', () => {
  // Feature: chat-and-help, Property 3: Pro chat messages never touch safety state (extends Property 5)
  // **Validates: Requirements 4.7, 21.2**
  it('any text and any status: saved with the rule status, or 409 for declined and emergency', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...JOB_STATUSES), validChatText, async (status, text) => {
        freshJob(status);
        const res = await proPost({ text });
        const body = (await res.json()) as Record<string, unknown>;

        if (status === 'declined' || status === 'emergency') {
          expect(res.status).toBe(409);
          expect(body.error).toBe(status === 'declined' ? 'ILLEGAL_TRANSITION' : 'JOB_IS_EMERGENCY');
          expect(storedChatItems()).toHaveLength(0);
          expect(storedJob()?.status).toBe(status);
        } else {
          const rule = statusAfterSend(status, 'tradesperson');
          expect(rule.ok).toBe(true);
          const expected = rule.ok ? rule.next : status;
          expect(res.status).toBe(200);
          expect(body.status).toBe(expected);
          expect(body.status).not.toBe('emergency');
          expect(JSON.stringify(body)).not.toContain(EMERGENCY_MESSAGE);
          const items = storedChatItems();
          expect(items).toHaveLength(1);
          expect(items[0]?.side).toBe('tradesperson');
          expect(items[0]?.text).toBe(text.trim());
          expect(storedJob()?.status).toBe(expected);
        }

        // The stored Job never becomes an emergency because of Pro text.
        if (status !== 'emergency') {
          expect(storedJob()?.status).not.toBe('emergency');
          expect(storedJob()?.urgency).not.toBe('emergency');
          expect(storedJob()?.isEmergency).toBe(false);
        }
        expectSafetyUntouched();
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});

// ── Property 10 (Pro cookie part only) ──────────────────────────────────────

const HOURS_MS = 60 * 60 * 1000;

/** hhi_pro values that must be rejected: missing, empty, junk, tampered, wrong secret, expired. */
const invalidProCookie: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  // Header-safe junk: no '=', ';', ',', whitespace or control characters.
  fc.stringMatching(/^[A-Za-z0-9._~+/-]{1,120}$/),
  fc.constantFrom('.', '..', 'a.b', 'a.b.c', 'null', 'undefined'),
  // A valid cookie with one character changed.
  fc.nat(500).map((i) => {
    const good = validProCookie(FIXTURE_NOW_MS);
    const at = i % good.length;
    return good.slice(0, at) + (good[at] === 'A' ? 'B' : 'A') + good.slice(at + 1);
  }),
  // Signed with a different secret.
  fc.stringMatching(/^[A-Za-z0-9]{8,40}$/).map((secret) => validProCookie(FIXTURE_NOW_MS, `x-${secret}`)),
  // Issued long enough ago to be expired (lifetime is 12 hours).
  fc.integer({ min: 13, max: 24 * 30 }).map((h) => validProCookie(FIXTURE_NOW_MS - h * HOURS_MS)),
);

describe('Property 10 (Pro cookie part only)', () => {
  // Feature: chat-and-help, Property 10 (Pro cookie part only): The Pro routes need the cookie
  // **Validates: Requirements 8.1, 8.2**
  it('GET and POST with a missing or invalid hhi_pro cookie give 401 UNAUTHORIZED and zero DynamoDB calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidProCookie,
        fc.constantFrom(...JOB_STATUSES),
        validChatText,
        async (cookie, status, text) => {
          freshJob(status);
          const before = JSON.stringify([...holder.fake.items.entries()]);

          // A missing cookie needs makeRequest directly: the helpers default undefined to a valid cookie.
          const get =
            cookie === undefined
              ? await callWithId(GET, makeRequest(CHAT_URL, { method: 'GET' }), JOB_ID)
              : await proGet(cookie);
          const post =
            cookie === undefined
              ? await callWithId(POST, makeRequest(CHAT_URL, { method: 'POST', body: { text } }), JOB_ID)
              : await proPost({ text }, cookie);
          for (const res of [get, post]) {
            expect(res.status).toBe(401);
            const body = (await res.json()) as Record<string, unknown>;
            expect(body.error).toBe('UNAUTHORIZED');
          }

          expect(holder.fake.calls).toHaveLength(0);
          expect(JSON.stringify([...holder.fake.items.entries()])).toBe(before);
          expectSafetyUntouched();
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
