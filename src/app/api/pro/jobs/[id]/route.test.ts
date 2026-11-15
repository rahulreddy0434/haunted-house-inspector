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
import { proJobDetailSchema } from '@/lib/validation/jobSchema';

vi.mock('server-only', () => ({}));

// The job detail route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the pro job detail route');
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

import { GET } from './route';

const JOB_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_ID = '33333333-3333-4333-8333-333333333333';
const LEGACY_ID = '44444444-4444-4444-8444-444444444444';
const KEYS = ['uploads/a.jpg', 'uploads/b.jpg', 'uploads/c.jpg'];

const FORBIDDEN_KEYS = [
  'diySteps',
  's3Keys',
  'isEmergency',
  'replyCount',
  'statusUpdatedAt',
  'bookedAt',
  'PK',
  'SK',
  'ttl',
  'GSI1PK',
  'GSI1SK',
];

const ACTIVE_KEYS = [
  'answers',
  'confidence',
  'costRangeHigh',
  'costRangeLow',
  'createdAt',
  'followUpQuestions',
  'id',
  'infoRequests',
  'jobBrief',
  'likelyIssue',
  'photos',
  'replies',
  'status',
  'trade',
  'urgency',
];

let spies: ConsoleSpies;
let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({
    DYNAMODB_TABLE_NAME: 'test-table',
    SESSION_SECRET: TEST_SECRET,
    PRO_ACCESS_CODE: TEST_ACCESS_CODE,
  });
  holder.fake = createFakeDynamoTable();
  spies = consoleSpies();
  s3Spies.send.mockReset();
  s3Spies.getUploadPresignedUrl.mockReset();
  s3Spies.getDownloadPresignedUrl.mockReset();
  s3Spies.getDownloadPresignedUrl.mockImplementation(
    async (key: string) => `https://signed.example/${key}?sig=abc`,
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function get(id: string = JOB_ID, cookie?: string | null): Promise<Response> {
  const value = cookie === undefined ? validProCookie(FIXTURE_NOW_MS) : cookie;
  const request = makeRequest(`/api/pro/jobs/${id}`, value === null ? {} : { cookie: value });
  return callWithId(GET, request, id);
}

function seedActive(status: Parameters<typeof makeJobItem>[0] = 'new', keys: string[] = KEYS): void {
  holder.fake.seed({ ...makeJobItem(status, { id: JOB_ID, s3Keys: keys }) });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('GET /api/pro/jobs/[id]', () => {
  describe('active job', () => {
    it('returns 200 with exactly the detail field set and the photo URLs', async () => {
      seedActive('new');
      const res = await get();
      expect(res.status).toBe(200);
      expectNoStore(res);
      const body = await json(res);
      expect(Object.keys(body).sort()).toEqual(ACTIVE_KEYS);
      for (const key of FORBIDDEN_KEYS) {
        expect(body).not.toHaveProperty(key);
      }
      expect(proJobDetailSchema.safeParse(body).success).toBe(true);
      expect(body).toMatchObject({ id: JOB_ID, status: 'new', trade: 'plumber' });
      expect(body.photos).toEqual(KEYS.map((k) => `https://signed.example/${k}?sig=abc`));
    });

    it('includes offeredSlots and bookedSlot for a booked job, but never bookedAt', async () => {
      seedActive('booked');
      const body = await json(await get());
      expect(body).toHaveProperty('offeredSlots');
      expect(body).toHaveProperty('bookedSlot');
      expect(body).not.toHaveProperty('bookedAt');
      expect(body).not.toHaveProperty('statusUpdatedAt');
    });

    it('includes declineReason for a declined job', async () => {
      seedActive('declined');
      const body = await json(await get());
      expect(body.declineReason).toBe('Outside my service area.');
    });

    it('sets no cookie', async () => {
      seedActive('new');
      const res = await get();
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('photo URLs', () => {
    it('signs each key once with expiry 900, in stored order, and again on a second request', async () => {
      seedActive('new');
      await get();
      expect(s3Spies.getDownloadPresignedUrl).toHaveBeenCalledTimes(3);
      expect(s3Spies.getDownloadPresignedUrl.mock.calls).toEqual(KEYS.map((k) => [k, 900]));

      await get();
      expect(s3Spies.getDownloadPresignedUrl).toHaveBeenCalledTimes(6);
      expect(s3Spies.getDownloadPresignedUrl.mock.calls.slice(3)).toEqual(KEYS.map((k) => [k, 900]));
    });

    it('omits one failed URL, keeps the others in order, and logs only the error name', async () => {
      seedActive('new');
      s3Spies.getDownloadPresignedUrl.mockImplementation(async (key: string) => {
        if (key === KEYS[1]) {
          throw Object.assign(new Error(`cannot sign https://signed.example/${key} ${key}`), {
            name: 'CredentialsProviderError',
          });
        }
        return `https://signed.example/${key}?sig=abc`;
      });

      const res = await get();

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.photos).toEqual([
        `https://signed.example/${KEYS[0]}?sig=abc`,
        `https://signed.example/${KEYS[2]}?sig=abc`,
      ]);
      const logged = spies.loggedText();
      expect(logged).toContain('CredentialsProviderError');
      expect(logged).not.toContain('signed.example');
      expect(logged).not.toContain('sig=abc');
      for (const key of KEYS) {
        expect(logged).not.toContain(key);
      }
    });

    it('never logs a URL on a successful request', async () => {
      seedActive('new');
      await get();
      const logged = spies.loggedText();
      expect(logged).not.toContain('signed.example');
      expect(logged).not.toContain('sig=abc');
    });
  });

  describe('emergency job', () => {
    function expectEmergencyShape(body: Record<string, unknown>): void {
      expect(Object.keys(body).sort()).toEqual(
        ['answers', 'createdAt', 'emergencyNote', 'id', 'likelyIssue', 'status', 'urgency'].sort(),
      );
      expect(body).toMatchObject({
        id: JOB_ID,
        status: 'emergency',
        urgency: 'emergency',
        emergencyNote: PRO_EMERGENCY_NOTE,
      });
      for (const key of FORBIDDEN_KEYS) {
        expect(body).not.toHaveProperty(key);
      }
      expect(body).not.toHaveProperty('photos');
      expect(body).not.toHaveProperty('trade');
      expect(body).not.toHaveProperty('jobBrief');
      expect(proJobDetailSchema.safeParse(body).success).toBe(true);
    }

    it('returns the exact emergency shape and makes zero S3 calls (status emergency)', async () => {
      holder.fake.seed({ ...makeJobItem('emergency', { id: JOB_ID, s3Keys: KEYS }) });
      const res = await get();
      expect(res.status).toBe(200);
      expectNoStore(res);
      expectEmergencyShape(await json(res));
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.send).not.toHaveBeenCalled();
    });

    it('treats a job that is an emergency only via urgency as an emergency', async () => {
      holder.fake.seed({
        ...makeJobItem('new', { id: JOB_ID, s3Keys: KEYS, urgency: 'emergency', isEmergency: false }),
      });
      const res = await get();
      expect(res.status).toBe(200);
      expectEmergencyShape(await json(res));
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.send).not.toHaveBeenCalled();
    });

    it('treats a job that is an emergency only via isEmergency as an emergency', async () => {
      holder.fake.seed({
        ...makeJobItem('accepted', { id: JOB_ID, s3Keys: KEYS, urgency: 'soon', isEmergency: true }),
      });
      const res = await get();
      expect(res.status).toBe(200);
      expectEmergencyShape(await json(res));
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.send).not.toHaveBeenCalled();
    });
  });

  describe('404 NOT_FOUND', () => {
    it('returns the same body for a non-UUID, an unknown id and a legacy job', async () => {
      holder.fake.seed(makeLegacyJobItem({ id: LEGACY_ID, PK: `JOB#${LEGACY_ID}`, SK: `JOB#${LEGACY_ID}` }));
      holder.fake.calls.length = 0;

      const nonUuid = await get('not-a-uuid');
      const nonUuidCalls = holder.fake.calls.length;
      const unknown = await get(UNKNOWN_ID);
      const legacy = await get(LEGACY_ID);

      expect(nonUuidCalls).toBe(0);
      for (const res of [nonUuid, unknown, legacy]) {
        expect(res.status).toBe(404);
        expectNoStore(res);
      }
      const expected = { error: 'NOT_FOUND', message: ERROR_MESSAGES.NOT_FOUND };
      expect(await nonUuid.json()).toEqual(expected);
      expect(await unknown.json()).toEqual(expected);
      expect(await legacy.json()).toEqual(expected);
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('500 errors', () => {
    it('returns 500 RESULT_INVALID for a stored job that fails validation, with no item data', async () => {
      holder.fake.seed({
        ...makeJobItem('new', { id: JOB_ID, s3Keys: KEYS, likelyIssue: 'SENTINEL-ISSUE-TEXT', confidence: 7 }),
      });
      const res = await get();
      expect(res.status).toBe(500);
      expectNoStore(res);
      const body = await json(res);
      expect(body).toEqual({ error: 'RESULT_INVALID', message: ERROR_MESSAGES.RESULT_INVALID });
      expect(JSON.stringify(body)).not.toContain('SENTINEL-ISSUE-TEXT');
      expect(JSON.stringify(body)).not.toContain(JOB_ID);
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
    });

    it('returns 500 LOAD_FAILED on a DynamoDB failure and logs only the error name', async () => {
      const failure = Object.assign(new Error(`boom ${TEST_SECRET}`), {
        name: 'ProvisionedThroughputExceededException',
      });
      vi.spyOn(holder.fake, 'send').mockRejectedValue(failure);
      const res = await get();
      expect(res.status).toBe(500);
      expectNoStore(res);
      expect(await res.json()).toEqual({
        error: 'LOAD_FAILED',
        message: ERROR_MESSAGES.LOAD_FAILED.detail,
      });
      const logged = spies.loggedText();
      expect(logged).toContain('ProvisionedThroughputExceededException');
      expect(logged).not.toContain('boom');
      expect(logged).not.toContain(TEST_SECRET);
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
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
      seedActive('new');
      holder.fake.calls.length = 0;
      const res = await get(JOB_ID, make());
      expect(res.status).toBe(401);
      expectNoStore(res);
      expect(await res.json()).toMatchObject({ error: 'UNAUTHORIZED' });
      expect(holder.fake.calls).toHaveLength(0);
      expect(s3Spies.send).not.toHaveBeenCalled();
      expect(s3Spies.getUploadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
    });
  });

  it('never imports the rate limiter (a throwing mock would fail the import)', async () => {
    seedActive('new');
    const res = await get();
    expect(res.status).toBe(200);
  });
});
