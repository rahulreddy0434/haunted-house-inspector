import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem, makeLegacyJobItem } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  callWithId,
  consoleSpies,
  expectNoStore,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { signProCookie } from '@/lib/pro/proCookie';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { SLOT_HORIZON_MS, SLOT_RULE_MESSAGES } from '@/lib/jobs/timeSlots';
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The accept route must never touch the rate limiter or the Safety_Layer.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the accept route');
});
vi.mock('@/lib/safety/safetyLayer', () => {
  throw new Error('safetyLayer must not be imported by the accept route');
});
vi.mock('@/lib/safety/replyCheck', () => {
  throw new Error('replyCheck must not be imported by the accept route');
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

import { POST } from './route';

const JOB_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_ID = '33333333-3333-4333-8333-333333333333';
const LEGACY_ID = '44444444-4444-4444-8444-444444444444';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const iso = (ms: number): string => new Date(ms).toISOString();
const inFuture = (ms: number): string => iso(FIXTURE_NOW_MS + ms);

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

function post(
  body: unknown,
  options: { id?: string; cookie?: string | null; headers?: Record<string, string> } = {},
): Promise<Response> {
  const id = options.id ?? JOB_ID;
  const cookie = options.cookie === undefined ? validProCookie(FIXTURE_NOW_MS) : options.cookie;
  const request = makeRequest(`/api/pro/jobs/${id}/accept`, {
    method: 'POST',
    body,
    headers: options.headers,
    ...(cookie === null ? {} : { cookie }),
  });
  return callWithId(POST, request, id);
}

function seed(status: JobStatus, overrides: Parameters<typeof makeJobItem>[1] = {}): void {
  holder.fake.seed({ ...makeJobItem(status, { id: JOB_ID, ...overrides }) });
}

function stored(id: string = JOB_ID): Record<string, unknown> {
  const item = holder.fake.get(`JOB#${id}`);
  if (!item) throw new Error('job missing');
  return item;
}

function countOf(name: string): number {
  return holder.fake.calls.filter((c) => c.name === name).length;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const GOOD_SLOTS = [inFuture(DAY_MS), inFuture(2 * DAY_MS)];

describe('POST /api/pro/jobs/[id]/accept', () => {
  describe('success', () => {
    it.each<JobStatus>(['new', 'info_requested'])('accepts from %s and stores sorted canonical slots', async (from) => {
      seed(from);
      const before = stored();
      // Unsorted and non-canonical (no milliseconds).
      const later = new Date(FIXTURE_NOW_MS + 3 * DAY_MS);
      const earlier = new Date(FIXTURE_NOW_MS + DAY_MS);
      const laterNoMs = later.toISOString().replace('.000Z', 'Z');
      const earlierNoMs = earlier.toISOString().replace('.000Z', 'Z');
      expect(laterNoMs).not.toBe(later.toISOString());

      const res = await post({ slots: [laterNoMs, earlierNoMs] });

      expect(res.status).toBe(200);
      expectNoStore(res);
      expect(await res.json()).toEqual({ status: 'accepted' });
      const after = stored();
      expect(after.status).toBe('accepted');
      expect(after.offeredSlots).toEqual([earlier.toISOString(), later.toISOString()]);
      expect(after.statusUpdatedAt).toBe(iso(FIXTURE_NOW_MS));
      expect(after.ttl).toBe(before.ttl);
      expect(after.infoRequests).toEqual(before.infoRequests);
      expect(after.replies).toEqual(before.replies);
      expect(after.replyCount).toBe(before.replyCount);

      const update = holder.fake.calls.find((c) => c.name === 'UpdateCommand');
      expect(update).toBeDefined();
      const values = update?.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(values[':expected']).toBe(from);
      expect(update?.input.ConditionExpression).toContain('#status = :expected');
    });

    it('sets no cookie', async () => {
      seed('new');
      const res = await post({ slots: GOOD_SLOTS });
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('400 slot rules', () => {
    const cases: Array<[keyof typeof SLOT_RULE_MESSAGES, () => unknown]> = [
      ['count', () => []],
      ['count', () => [1, 2, 3, 4].map((d) => inFuture(d * DAY_MS))],
      ['format', () => ['not-a-date']],
      ['format', () => [inFuture(DAY_MS).replace('Z', '+02:00')]],
      ['distinct', () => [inFuture(DAY_MS), inFuture(DAY_MS)]],
      ['past', () => [inFuture(-HOUR_MS)]],
      ['past', () => [inFuture(0)]],
      ['horizon', () => [inFuture(SLOT_HORIZON_MS + 1)]],
    ];

    it.each(cases)('rejects a %s violation with the exact message and no write', async (rule, make) => {
      seed('new');
      const before = JSON.stringify(stored());
      holder.fake.calls.length = 0;

      const res = await post({ slots: make() });

      expect(res.status).toBe(400);
      expectNoStore(res);
      expect(await res.json()).toEqual({ error: 'INVALID_REQUEST', message: SLOT_RULE_MESSAGES[rule] });
      expect(countOf('UpdateCommand')).toBe(0);
      expect(JSON.stringify(stored())).toBe(before);
    });

    it('accepts a slot exactly at the horizon', async () => {
      seed('new');
      const res = await post({ slots: [inFuture(SLOT_HORIZON_MS)] });
      expect(res.status).toBe(200);
    });
  });

  describe('400 malformed bodies', () => {
    const cases: Array<[string, unknown]> = [
      ['missing slots', {}],
      ['slots is a string', { slots: 'tomorrow' }],
      ['slots is an object', { slots: {} }],
      ['slots is null', { slots: null }],
      ['invalid JSON', '{not json'],
      ['array body', []],
      ['string body', '"hello"'],
      ['null body', 'null'],
      ['number body', '42'],
    ];

    it.each(cases)('returns 400 for %s with no write', async (_name, body) => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post(body);
      expect(res.status).toBe(400);
      expectNoStore(res);
      const parsed = await json(res);
      expect(parsed.error).toBe('INVALID_REQUEST');
      expect(typeof parsed.message).toBe('string');
      expect(countOf('UpdateCommand')).toBe(0);
    });

    it('returns the generic invalid-request message for invalid JSON and a non-object body', async () => {
      seed('new');
      for (const body of ['{not json', '[]', '"x"']) {
        const res = await post(body);
        expect(await res.json()).toEqual({
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        });
      }
    });
  });

  describe('404 NOT_FOUND', () => {
    it('returns the same body for a non-UUID, an unknown id and a legacy job', async () => {
      holder.fake.seed(makeLegacyJobItem({ id: LEGACY_ID, PK: `JOB#${LEGACY_ID}`, SK: `JOB#${LEGACY_ID}` }));
      holder.fake.calls.length = 0;

      const nonUuid = await post({ slots: GOOD_SLOTS }, { id: 'not-a-uuid' });
      const nonUuidCalls = holder.fake.calls.length;
      const unknown = await post({ slots: GOOD_SLOTS }, { id: UNKNOWN_ID });
      const legacy = await post({ slots: GOOD_SLOTS }, { id: LEGACY_ID });

      expect(nonUuidCalls).toBe(0);
      const expected = { error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND };
      for (const res of [nonUuid, unknown, legacy]) {
        expect(res.status).toBe(404);
        expectNoStore(res);
        expect(await res.json()).toEqual(expected);
      }
      expect(countOf('UpdateCommand')).toBe(0);
    });
  });

  describe('409 conflicts', () => {
    it.each<JobStatus>(['accepted', 'declined', 'booked'])(
      'returns ILLEGAL_TRANSITION with the current status for %s and does not write',
      async (status) => {
        seed(status);
        const before = JSON.stringify(stored());
        holder.fake.calls.length = 0;

        const res = await post({ slots: GOOD_SLOTS });

        expect(res.status).toBe(409);
        expectNoStore(res);
        expect(await res.json()).toEqual({
          error: 'ILLEGAL_TRANSITION',
          message: ERROR_MESSAGES.ILLEGAL_TRANSITION,
          status,
        });
        expect(countOf('UpdateCommand')).toBe(0);
        expect(JSON.stringify(stored())).toBe(before);
      },
    );

    it('returns JOB_IS_EMERGENCY with the Pro note, no slots, and no write', async () => {
      seed('emergency');
      holder.fake.calls.length = 0;

      const res = await post({ slots: GOOD_SLOTS });

      expect(res.status).toBe(409);
      expectNoStore(res);
      const body = await json(res);
      expect(body).toEqual({ error: 'JOB_IS_EMERGENCY', message: PRO_EMERGENCY_NOTE, status: 'emergency' });
      expect(JSON.stringify(body)).not.toContain('slots');
      expect(countOf('UpdateCommand')).toBe(0);
      expect(stored().status).toBe('emergency');
    });

    it('re-reads exactly once and does not write again when the condition fails', async () => {
      seed('new');
      const fake = holder.fake;
      const realSend = fake.send;
      // Another request moves the Job to declined just before our write lands.
      fake.send = async (command) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === 'UpdateCommand') {
          fake.seed({ ...makeJobItem('declined', { id: JOB_ID }) });
        }
        return realSend(command);
      };

      const res = await post({ slots: GOOD_SLOTS });

      expect(res.status).toBe(409);
      expectNoStore(res);
      expect(await res.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: 'declined' });
      expect(countOf('UpdateCommand')).toBe(1);
      expect(countOf('GetCommand')).toBe(2);
      expect(stored().status).toBe('declined');
      expect(stored().offeredSlots).toBeUndefined();
    });
  });

  describe('413 PAYLOAD_TOO_LARGE', () => {
    it('rejects a body over 4 KB with no DynamoDB call', async () => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post({ slots: GOOD_SLOTS, pad: 'x'.repeat(5000) });
      expect(res.status).toBe(413);
      expectNoStore(res);
      expect(await res.json()).toEqual({
        error: 'PAYLOAD_TOO_LARGE',
        message: ERROR_MESSAGES.PAYLOAD_TOO_LARGE,
      });
      expect(holder.fake.calls).toHaveLength(0);
    });
  });

  describe('500 and logging', () => {
    it('returns 500 ACTION_FAILED on a DynamoDB failure and logs only the error name', async () => {
      seed('new');
      const slots = GOOD_SLOTS;
      const cookie = validProCookie(FIXTURE_NOW_MS);
      const err = new Error(`boom ${TEST_SECRET} ${TEST_ACCESS_CODE} ${cookie} ${slots.join(',')}`);
      err.name = 'ThrottlingException';
      holder.fake.send = () => Promise.reject(err);

      const res = await post({ slots }, { cookie });

      expect(res.status).toBe(500);
      expectNoStore(res);
      expect(await res.json()).toEqual({ error: 'ACTION_FAILED', message: ERROR_MESSAGES.ACTION_FAILED });
      const logged = spies.loggedText();
      expect(logged).toContain('ThrottlingException');
      expect(logged).not.toContain('boom');
      expect(logged).not.toContain(TEST_SECRET);
      expect(logged).not.toContain(TEST_ACCESS_CODE);
      expect(logged).not.toContain(cookie);
      expect(logged).not.toContain('hhi_pro');
      for (const slot of slots) expect(logged).not.toContain(slot);
    });

    it('logs nothing on a successful accept', async () => {
      seed('new');
      await post({ slots: GOOD_SLOTS });
      expect(spies.loggedText()).toBe('');
    });
  });

  describe('authentication and check order', () => {
    const cases: Array<[string, () => string | null]> = [
      ['absent', () => null],
      ['malformed', () => 'not-a-cookie'],
      [
        'tampered',
        () => {
          const [payload, sig] = validProCookie(FIXTURE_NOW_MS).split('.');
          const forged = Buffer.from(JSON.stringify({ role: 'pro', exp: FIXTURE_NOW_MS + 10 ** 12 })).toString(
            'base64url',
          );
          return payload === forged ? `${payload}.${sig}x` : `${forged}.${sig}`;
        },
      ],
      ['wrong-secret', () => validProCookie(FIXTURE_NOW_MS, 'a-different-fake-secret')],
      ['expired', () => signProCookie({ role: 'pro', exp: FIXTURE_NOW_MS - 1 }, TEST_SECRET)],
    ];

    it.each(cases)('returns 401 for an %s cookie with no DynamoDB or S3 call', async (_name, make) => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post({ slots: GOOD_SLOTS }, { cookie: make() });
      expect(res.status).toBe(401);
      expectNoStore(res);
      expect(await res.json()).toMatchObject({ error: 'UNAUTHORIZED' });
      expect(holder.fake.calls).toHaveLength(0);
      expect(s3Spies.send).not.toHaveBeenCalled();
      expect(s3Spies.getUploadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      expect(stored().status).toBe('new');
    });

    const unauthInputs: Array<[string, unknown, string]> = [
      ['an oversized body', { slots: GOOD_SLOTS, pad: 'x'.repeat(5000) }, JOB_ID],
      ['invalid JSON', '{not json', JOB_ID],
      ['a non-object body', '[]', JOB_ID],
      ['a bad id', { slots: GOOD_SLOTS }, 'not-a-uuid'],
      ['an unknown id', { slots: GOOD_SLOTS }, UNKNOWN_ID],
      ['invalid slots', { slots: [] }, JOB_ID],
    ];

    it.each(unauthInputs)('returns 401 (never 400, 404 or 413) without a cookie for %s', async (_name, body, id) => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post(body, { id, cookie: null });
      expect(res.status).toBe(401);
      expect(holder.fake.calls).toHaveLength(0);
    });
  });

  describe('imports', () => {
    it('does not use the rate limiter or the Safety_Layer (throwing mocks would fail the import)', async () => {
      seed('new');
      const res = await post({ slots: GOOD_SLOTS });
      expect(res.status).toBe(200);
    });
  });
});
