import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('server-only', () => ({}));

// Importing either module from any route makes this whole file fail to load.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the Homeowner_API or Pro_API routes');
});
vi.mock('@/lib/aws/bedrock', () => {
  throw new Error('bedrock must not be imported by the Homeowner_API or Pro_API routes');
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

import { GET as homeownerStatus } from '@/app/api/inspections/[id]/status/route';
import { POST as homeownerReply } from '@/app/api/inspections/[id]/reply/route';
import { POST as homeownerBook } from '@/app/api/inspections/[id]/book/route';
import { GET as proList } from '@/app/api/pro/jobs/route';
import { GET as proDetail } from '@/app/api/pro/jobs/[id]/route';
import { POST as proAccept } from '@/app/api/pro/jobs/[id]/accept/route';
import { POST as proDecline } from '@/app/api/pro/jobs/[id]/decline/route';
import { POST as proAskInfo } from '@/app/api/pro/jobs/[id]/ask-info/route';

const DAY_MS = 24 * 60 * 60 * 1000;
const FORBIDDEN_COMMANDS = ['ScanCommand', 'DeleteCommand', 'BatchWriteCommand'];

const ID = {
  status: '10000000-0000-4000-8000-000000000001',
  reply: '10000000-0000-4000-8000-000000000002',
  book: '10000000-0000-4000-8000-000000000003',
  detail: '10000000-0000-4000-8000-000000000004',
  accept: '10000000-0000-4000-8000-000000000005',
  decline: '10000000-0000-4000-8000-000000000006',
  askInfo: '10000000-0000-4000-8000-000000000007',
};

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
  s3Spies.getDownloadPresignedUrl.mockResolvedValue('https://example.test/photo.jpg');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function proCookie(): string {
  return validProCookie(FIXTURE_NOW_MS);
}

function pkOf(input: Record<string, unknown>): unknown {
  const key = input.Key as Record<string, unknown> | undefined;
  const item = input.Item as Record<string, unknown> | undefined;
  return key?.PK ?? item?.PK;
}

describe('Homeowner_API and Pro_API routes never use the rate limiter', () => {
  // **Validates: Requirements 2.13, 7.17, 8.14, 9.14, 10.12, 14.10, 16.7, 16.17**
  it('one successful request per route writes no RATELIMIT# item, sets no hhi_session cookie and uses no forbidden command', async () => {
    const fake = holder.fake;
    const newJob = (id: string) => fake.seed({ ...makeJobItem('new', { id }) });
    newJob(ID.status);
    newJob(ID.detail);
    newJob(ID.accept);
    newJob(ID.decline);
    newJob(ID.askInfo);
    fake.seed({ ...makeJobItem('info_requested', { id: ID.reply }) });
    const accepted = makeJobItem('accepted', { id: ID.book });
    fake.seed({ ...accepted });
    const slot = accepted.offeredSlots?.[0];
    if (slot === undefined) throw new Error('fixture has no offered slot');
    const futureSlots = [new Date(FIXTURE_NOW_MS + DAY_MS).toISOString(), new Date(FIXTURE_NOW_MS + 2 * DAY_MS).toISOString()];

    const cookie = proCookie();
    const responses: Array<[string, Response]> = [];
    const run = async (name: string, expected: number, call: () => Promise<Response>): Promise<void> => {
      const res = await call();
      expect(res.status, name).toBe(expected);
      responses.push([name, res]);
    };

    await run('status', 200, () =>
      callWithId(homeownerStatus, makeRequest(`/api/inspections/${ID.status}/status`), ID.status),
    );
    await run('reply', 200, () =>
      callWithId(
        homeownerReply,
        makeRequest(`/api/inspections/${ID.reply}/reply`, { method: 'POST', body: { text: 'Yes, it drips all day' } }),
        ID.reply,
      ),
    );
    await run('book', 200, () =>
      callWithId(
        homeownerBook,
        makeRequest(`/api/inspections/${ID.book}/book`, { method: 'POST', body: { slot } }),
        ID.book,
      ),
    );
    await run('pro list', 200, () => Promise.resolve(proList(makeRequest('/api/pro/jobs', { cookie }))));
    await run('pro detail', 200, () =>
      callWithId(proDetail, makeRequest(`/api/pro/jobs/${ID.detail}`, { cookie }), ID.detail),
    );
    await run('accept', 200, () =>
      callWithId(
        proAccept,
        makeRequest(`/api/pro/jobs/${ID.accept}/accept`, { method: 'POST', body: { slots: futureSlots }, cookie }),
        ID.accept,
      ),
    );
    await run('decline', 200, () =>
      callWithId(
        proDecline,
        makeRequest(`/api/pro/jobs/${ID.decline}/decline`, { method: 'POST', body: {}, cookie }),
        ID.decline,
      ),
    );
    await run('ask-info', 200, () =>
      callWithId(
        proAskInfo,
        makeRequest(`/api/pro/jobs/${ID.askInfo}/ask-info`, {
          method: 'POST',
          body: { question: 'Is the leak constant?' },
          cookie,
        }),
        ID.askInfo,
      ),
    );

    // No RATELIMIT# item in the table, and no write call aimed at one.
    for (const key of fake.items.keys()) {
      expect(key.startsWith('RATELIMIT#')).toBe(false);
    }
    for (const call of fake.calls) {
      const pk = pkOf(call.input);
      expect(typeof pk === 'string' && pk.startsWith('RATELIMIT#')).toBe(false);
    }

    // No hhi_session cookie anywhere.
    for (const [name, res] of responses) {
      const setCookies = res.headers.getSetCookie();
      for (const value of setCookies) {
        expect(value, name).not.toContain('hhi_session');
      }
      expect(res.headers.get('set-cookie') ?? '', name).not.toContain('hhi_session');
    }

    // Only the allowed command classes were used.
    const names = new Set(fake.calls.map((c) => c.name));
    for (const forbidden of FORBIDDEN_COMMANDS) {
      expect(names.has(forbidden), forbidden).toBe(false);
    }
    expect(fake.calls.length).toBeGreaterThan(0);
  });
});
