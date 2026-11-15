import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS, makeJobItem } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  consoleSpies,
  expectNoStore,
  makeRequest,
  validProCookie,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { signProCookie } from '@/lib/pro/proCookie';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { toProListItem } from '@/lib/jobs/views';

vi.mock('server-only', () => ({}));

// The job list route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the pro jobs route');
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

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function uuid(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

/** Seeds `count` jobs; index 0 is the newest (one minute old), each next one a minute older. */
function seedJobs(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const createdAt = new Date(FIXTURE_NOW_MS - (i + 1) * MINUTE_MS).toISOString();
    holder.fake.seed({ ...makeJobItem('new', { id: uuid(i + 1), createdAt }) });
  }
}

/** Calls GET with a valid Pro cookie, unless `options.cookie` is given (`null` = no cookie). */
function get(path = '/api/pro/jobs', cookie?: string | null): Promise<Response> {
  const value = cookie === undefined ? validProCookie(FIXTURE_NOW_MS) : cookie;
  return Promise.resolve(GET(makeRequest(path, value === null ? {} : { cookie: value })));
}

interface ListBody {
  jobs: Array<Record<string, unknown>>;
}

async function readList(res: Response): Promise<ListBody> {
  return (await res.json()) as ListBody;
}

describe('GET /api/pro/jobs', () => {
  describe('success', () => {
    it('returns 200 with the 50 newest of 60 jobs, newest first', async () => {
      seedJobs(60);
      const res = await get();
      expect(res.status).toBe(200);
      expectNoStore(res);
      const body = await readList(res);
      expect(body.jobs).toHaveLength(50);
      expect(body.jobs.map((j) => j.id)).toEqual(Array.from({ length: 50 }, (_, i) => uuid(i + 1)));
      const times = body.jobs.map((j) => Date.parse(String(j.createdAt)));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('returns 200 with { jobs: [] } for an empty list', async () => {
      const res = await get();
      expect(res.status).toBe(200);
      expectNoStore(res);
      expect(await res.json()).toEqual({ jobs: [] });
    });

    it('returns exactly the list item fields and maps them like toProListItem', async () => {
      const item = makeJobItem('new', { id: uuid(1) });
      holder.fake.seed({ ...item });
      const res = await get();
      const body = await readList(res);
      expect(body.jobs).toHaveLength(1);
      expect(Object.keys(body.jobs[0]).sort()).toEqual(
        ['createdAt', 'id', 'location', 'status', 'trade', 'urgency'].sort(),
      );
      expect(body.jobs[0]).toEqual(
        toProListItem({
          id: item.id,
          createdAt: item.createdAt,
          urgency: item.urgency,
          trade: item.trade,
          status: item.status,
          isEmergency: item.isEmergency,
          answers: { location: item.answers.location },
        }),
      );
      expect(body.jobs[0]).toMatchObject({ trade: 'plumber', location: 'Kitchen', status: 'new' });
    });

    it('returns trade null for an emergency job and no other extra field', async () => {
      holder.fake.seed({ ...makeJobItem('emergency', { id: uuid(1) }) });
      const body = await readList(await get());
      expect(body.jobs[0].trade).toBeNull();
      expect(body.jobs[0].status).toBe('emergency');
      expect(body.jobs[0].urgency).toBe('emergency');
      expect(Object.keys(body.jobs[0]).sort()).toEqual(
        ['createdAt', 'id', 'location', 'status', 'trade', 'urgency'].sort(),
      );
    });
  });

  describe('the DynamoDB query', () => {
    it('sends exactly one QueryCommand on GSI1 with the documented parameters', async () => {
      seedJobs(3);
      await get();
      expect(holder.fake.calls).toHaveLength(1);
      const call = holder.fake.calls[0];
      expect(call.name).toBe('QueryCommand');
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.ExpressionAttributeValues).toEqual({
        ':pk': 'JOBS',
        ':since': new Date(FIXTURE_NOW_MS - 30 * DAY_MS).toISOString(),
      });
      expect(call.input.ScanIndexForward).toBe(false);
      expect(call.input.Limit).toBe(50);
    });

    it('never sends Scan, DeleteItem or BatchWriteItem (the fake table guard would throw)', async () => {
      seedJobs(5);
      const res = await get();
      expect(res.status).toBe(200);
      const names = holder.fake.calls.map((c) => c.name);
      expect(names).not.toContain('ScanCommand');
      expect(names).not.toContain('DeleteCommand');
      expect(names).not.toContain('BatchWriteCommand');
    });

    it('ignores a cursor and page query string', async () => {
      seedJobs(60);
      const res = await get('/api/pro/jobs?cursor=abc123&page=2');
      const body = await readList(res);
      expect(body.jobs.map((j) => j.id)).toEqual(Array.from({ length: 50 }, (_, i) => uuid(i + 1)));
      expect(holder.fake.calls).toHaveLength(1);
      expect(holder.fake.calls[0].input).not.toHaveProperty('ExclusiveStartKey');
    });
  });

  describe('Query failure', () => {
    it('returns 500 LOAD_FAILED and logs only the error name', async () => {
      const failure = Object.assign(new Error(`boom ${TEST_SECRET} ${TEST_ACCESS_CODE}`), {
        name: 'ProvisionedThroughputExceededException',
      });
      vi.spyOn(holder.fake, 'send').mockRejectedValue(failure);
      const cookie = validProCookie(FIXTURE_NOW_MS);

      const res = await get('/api/pro/jobs', cookie);

      expect(res.status).toBe(500);
      expectNoStore(res);
      expect(await res.json()).toEqual({
        error: 'LOAD_FAILED',
        message: "We couldn't load the jobs. Please try again.",
      });
      expect(ERROR_MESSAGES.LOAD_FAILED.list).toBe("We couldn't load the jobs. Please try again.");

      const logged = spies.loggedText();
      expect(logged).toContain('ProvisionedThroughputExceededException');
      expect(logged).not.toContain(TEST_SECRET);
      expect(logged).not.toContain(TEST_ACCESS_CODE);
      expect(logged).not.toContain(cookie);
      expect(logged).not.toContain('boom');
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
      seedJobs(3);
      const res = await get('/api/pro/jobs', make());
      expect(res.status).toBe(401);
      expectNoStore(res);
      expect(await res.json()).toMatchObject({ error: 'UNAUTHORIZED' });
      expect(holder.fake.calls).toHaveLength(0);
      expect(s3Spies.send).not.toHaveBeenCalled();
      expect(s3Spies.getUploadPresignedUrl).not.toHaveBeenCalled();
      expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
    });

    it('returns 401 when SESSION_SECRET is unset, even with a cookie signed by the test secret', async () => {
      const cookie = validProCookie(FIXTURE_NOW_MS);
      const restore = withEnv({ SESSION_SECRET: undefined });
      try {
        const res = await get('/api/pro/jobs', cookie);
        expect(res.status).toBe(401);
        expectNoStore(res);
        expect(holder.fake.calls).toHaveLength(0);
        expect(s3Spies.send).not.toHaveBeenCalled();
        expect(s3Spies.getDownloadPresignedUrl).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  it('never imports the rate limiter (a throwing mock would fail the import)', async () => {
    seedJobs(1);
    const res = await get();
    expect(res.status).toBe(200);
  });
});
