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
import type { JobStatus } from '@/types/job';

vi.mock('server-only', () => ({}));

// The ask-info route must never touch the rate limiter or the Safety_Layer.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the ask-info route');
});
vi.mock('@/lib/safety/safetyLayer', () => {
  throw new Error('safetyLayer must not be imported by the ask-info route');
});
vi.mock('@/lib/safety/replyCheck', () => {
  throw new Error('replyCheck must not be imported by the ask-info route');
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

const iso = (ms: number): string => new Date(ms).toISOString();
const QUESTION = 'Is the stain getting bigger over time?';

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
  const request = makeRequest(`/api/pro/jobs/${id}/ask-info`, {
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

function history(n: number): {
  infoRequests: Array<{ question: string; askedAt: string }>;
  replies: Array<{ text: string; at: string }>;
  replyCount: number;
} {
  return {
    infoRequests: Array.from({ length: n }, (_v, i) => ({
      question: `Earlier question ${i + 1}?`,
      askedAt: iso(FIXTURE_NOW_MS - (n - i) * 3600_000),
    })),
    replies: Array.from({ length: n }, (_v, i) => ({
      text: `Earlier reply ${i + 1}.`,
      at: iso(FIXTURE_NOW_MS - (n - i) * 3600_000 + 60_000),
    })),
    replyCount: n,
  };
}

describe('POST /api/pro/jobs/[id]/ask-info', () => {
  describe('success', () => {
    it('asks from new: appends the trimmed question and leaves replies and ttl alone', async () => {
      const earlier = history(2);
      seed('new', earlier);
      const before = stored();

      const res = await post({ question: `  \t${QUESTION}\n ` });

      expect(res.status).toBe(200);
      expectNoStore(res);
      expect(await res.json()).toEqual({ status: 'info_requested' });
      const after = stored();
      expect(after.status).toBe('info_requested');
      expect(after.infoRequests).toEqual([
        ...earlier.infoRequests,
        { question: QUESTION, askedAt: iso(FIXTURE_NOW_MS) },
      ]);
      expect(after.replies).toEqual(before.replies);
      expect(after.replyCount).toBe(before.replyCount);
      expect(after.statusUpdatedAt).toBe(iso(FIXTURE_NOW_MS));
      expect(after.ttl).toBe(before.ttl);
      expect(res.headers.get('set-cookie')).toBeNull();

      const update = holder.fake.calls.find((c) => c.name === 'UpdateCommand');
      const values = update?.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(values[':expected']).toBe('new');
    });

    it('appends to an empty history', async () => {
      seed('new');
      const res = await post({ question: QUESTION });
      expect(res.status).toBe(200);
      expect(stored().infoRequests).toEqual([{ question: QUESTION, askedAt: iso(FIXTURE_NOW_MS) }]);
    });
  });

  describe('question validation', () => {
    it.each<[string, unknown]>([
      ['a missing question', {}],
      ['a number', { question: 5 }],
      ['null', { question: null }],
      ['an object', { question: {} }],
      ['an array', { question: ['x'] }],
      ['a boolean', { question: true }],
      ['an empty string', { question: '' }],
      ['a whitespace-only string', { question: ' \t\n  ' }],
      ['301 characters after trim', { question: `  ${'a'.repeat(301)}  ` }],
    ])('rejects %s with 400 and no write', async (_name, body) => {
      seed('new');
      const before = JSON.stringify(stored());
      holder.fake.calls.length = 0;

      const res = await post(body);

      expect(res.status).toBe(400);
      expectNoStore(res);
      expect(await res.json()).toEqual({ error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_REQUEST });
      expect(countOf('UpdateCommand')).toBe(0);
      expect(JSON.stringify(stored())).toBe(before);
    });

    it('accepts exactly 300 characters (after trim)', async () => {
      seed('new');
      const question = 'a'.repeat(300);
      const res = await post({ question: `  ${question}  ` });
      expect(res.status).toBe(200);
      expect((stored().infoRequests as Array<{ question: string }>)[0].question).toBe(question);
    });

    it.each<[string, unknown]>([
      ['invalid JSON', '{not json'],
      ['an array body', []],
      ['a null body', 'null'],
      ['no body', undefined],
    ])('returns 400 for %s', async (_name, body) => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe('INVALID_REQUEST');
      expect(countOf('UpdateCommand')).toBe(0);
    });
  });

  describe('404 NOT_FOUND', () => {
    it('returns the same body for a non-UUID, an unknown id and a legacy job', async () => {
      holder.fake.seed(makeLegacyJobItem({ id: LEGACY_ID, PK: `JOB#${LEGACY_ID}`, SK: `JOB#${LEGACY_ID}` }));
      holder.fake.calls.length = 0;

      const nonUuid = await post({ question: QUESTION }, { id: 'not-a-uuid' });
      const nonUuidCalls = holder.fake.calls.length;
      const unknown = await post({ question: QUESTION }, { id: UNKNOWN_ID });
      const legacy = await post({ question: QUESTION }, { id: LEGACY_ID });

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
    it.each<JobStatus>(['info_requested', 'accepted', 'declined', 'booked'])(
      'returns ILLEGAL_TRANSITION with the current status for %s and does not write',
      async (status) => {
        seed(status);
        const before = JSON.stringify(stored());
        holder.fake.calls.length = 0;

        const res = await post({ question: QUESTION });

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

    it('returns JOB_IS_EMERGENCY with the Pro note and no write', async () => {
      seed('emergency');
      const before = JSON.stringify(stored());
      holder.fake.calls.length = 0;

      const res = await post({ question: QUESTION });

      expect(res.status).toBe(409);
      expectNoStore(res);
      expect(await res.json()).toEqual({ error: 'JOB_IS_EMERGENCY', message: PRO_EMERGENCY_NOTE, status: 'emergency' });
      expect(countOf('UpdateCommand')).toBe(0);
      expect(JSON.stringify(stored())).toBe(before);
    });

    it('returns REPLY_LIMIT_REACHED at replyCount 5 with no write', async () => {
      seed('new', history(5));
      const before = JSON.stringify(stored());
      holder.fake.calls.length = 0;

      const res = await post({ question: QUESTION });

      expect(res.status).toBe(409);
      expectNoStore(res);
      expect(await res.json()).toEqual({
        error: 'REPLY_LIMIT_REACHED',
        message: ERROR_MESSAGES.REPLY_LIMIT_REACHED,
      });
      expect(countOf('UpdateCommand')).toBe(0);
      expect(JSON.stringify(stored())).toBe(before);
    });

    it('still allows a question at replyCount 4', async () => {
      seed('new', history(4));
      const res = await post({ question: QUESTION });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'info_requested' });
      expect(stored().infoRequests).toHaveLength(5);
      expect(stored().replyCount).toBe(4);
    });

    it('re-reads exactly once and does not write again when the condition fails', async () => {
      seed('new');
      const fake = holder.fake;
      const realSend = fake.send;
      // Another request accepts the Job just before our write lands.
      fake.send = async (command) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        if (name === 'UpdateCommand') {
          fake.seed({ ...makeJobItem('accepted', { id: JOB_ID }) });
        }
        return realSend(command);
      };

      const res = await post({ question: QUESTION });

      expect(res.status).toBe(409);
      expectNoStore(res);
      expect(await res.json()).toMatchObject({ error: 'ILLEGAL_TRANSITION', status: 'accepted' });
      expect(countOf('UpdateCommand')).toBe(1);
      expect(countOf('GetCommand')).toBe(2);
      expect(stored().status).toBe('accepted');
    });
  });

  describe('413 PAYLOAD_TOO_LARGE', () => {
    it('rejects a body over 4 KB with no DynamoDB call', async () => {
      seed('new');
      holder.fake.calls.length = 0;
      const res = await post({ question: QUESTION, pad: 'x'.repeat(5000) });
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
    it('returns 500 ACTION_FAILED on a DynamoDB failure and never logs the question', async () => {
      seed('new');
      const cookie = validProCookie(FIXTURE_NOW_MS);
      const err = new Error(`boom ${TEST_SECRET} ${TEST_ACCESS_CODE} ${cookie} ${QUESTION}`);
      err.name = 'ThrottlingException';
      holder.fake.send = () => Promise.reject(err);

      const res = await post({ question: QUESTION }, { cookie });

      expect(res.status).toBe(500);
      expectNoStore(res);
      expect(await res.json()).toEqual({ error: 'ACTION_FAILED', message: ERROR_MESSAGES.ACTION_FAILED });
      const logged = spies.loggedText();
      expect(logged).toContain('ThrottlingException');
      expect(logged).not.toContain('boom');
      expect(logged).not.toContain(QUESTION);
      expect(logged).not.toContain(TEST_SECRET);
      expect(logged).not.toContain(TEST_ACCESS_CODE);
      expect(logged).not.toContain(cookie);
    });

    it('logs nothing on success (the question never reaches the log)', async () => {
      seed('new');
      const res = await post({ question: QUESTION });
      expect(res.status).toBe(200);
      expect(spies.loggedText()).toBe('');
    });

    it('does not log the question when it is rejected as too long', async () => {
      seed('new');
      await post({ question: 'secret-question-'.repeat(30) });
      expect(spies.loggedText()).not.toContain('secret-question');
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
      const res = await post({ question: QUESTION }, { cookie: make() });
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
      ['an oversized body', { question: QUESTION, pad: 'x'.repeat(5000) }, JOB_ID],
      ['invalid JSON', '{not json', JOB_ID],
      ['a non-object body', '[]', JOB_ID],
      ['a bad id', { question: QUESTION }, 'not-a-uuid'],
      ['an unknown id', { question: QUESTION }, UNKNOWN_ID],
      ['a missing question', {}, JOB_ID],
      ['an over-length question', { question: 'a'.repeat(301) }, JOB_ID],
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
      const res = await post({ question: QUESTION });
      expect(res.status).toBe(200);
    });
  });
});
