import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  expectNoStore,
  makeRequest,
  validProCookie,
  withEnv,
} from '@/test/proRouteHarness';

vi.mock('server-only', () => ({}));

// Importing the rate limiter from the logout route makes this file fail to load.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the logout route');
});

const aws = vi.hoisted(() => ({
  s3Send: vi.fn(),
  getUploadPresignedUrl: vi.fn(),
  getDownloadPresignedUrl: vi.fn(),
  dynamoSend: vi.fn(),
  dynamoFrom: vi.fn(),
}));
vi.mock('@/lib/aws/s3', () => ({
  s3Client: { send: aws.s3Send },
  getUploadPresignedUrl: aws.getUploadPresignedUrl,
  getDownloadPresignedUrl: aws.getDownloadPresignedUrl,
}));
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: aws.dynamoFrom },
}));

import { POST } from '@/app/api/pro/logout/route';

const NOW_MS = Date.parse('2026-01-15T12:00:00.000Z');

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = withEnv({ PRO_ACCESS_CODE: TEST_ACCESS_CODE, SESSION_SECRET: TEST_SECRET });
  Object.values(aws).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  restoreEnv();
});

function expectClearingCookie(res: Response): void {
  const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
  expect(setCookie).toContain('hhi_pro=');
  expect(setCookie).toContain('max-age=0');
  expect(setCookie).toContain('path=/api/pro');
  expect(setCookie).toContain('httponly');
  expect(setCookie).toContain('secure');
  expect(setCookie).toContain('samesite=strict');
}

function expectNoAwsCalls(): void {
  for (const [name, fn] of Object.entries(aws)) {
    expect(fn, name).not.toHaveBeenCalled();
  }
}

describe('POST /api/pro/logout', () => {
  // **Validates: Requirements 1.11, 1.12, 14.3, 3.9**
  it('returns 200 { ok: true } and clears the cookie when no cookie is sent', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectClearingCookie(res);
    expectNoStore(res);
    expectNoAwsCalls();
  });

  it('returns 200 { ok: true } and clears the cookie when a valid hhi_pro cookie is sent', async () => {
    const req = makeRequest('/api/pro/logout', { method: 'POST', cookie: validProCookie(NOW_MS) });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectClearingCookie(res);
    expectNoStore(res);
    expectNoAwsCalls();
  });

  it('returns 200 { ok: true } and clears the cookie when the hhi_pro cookie is garbage', async () => {
    const req = makeRequest('/api/pro/logout', { method: 'POST', cookie: 'not-a-real-cookie.value' });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectClearingCookie(res);
    expectNoStore(res);
    expectNoAwsCalls();
  });

  it('still returns 200 and clears the cookie when PRO_ACCESS_CODE and SESSION_SECRET are unset', async () => {
    restoreEnv();
    restoreEnv = withEnv({ PRO_ACCESS_CODE: undefined, SESSION_SECRET: undefined });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectClearingCookie(res);
    expectNoStore(res);
    expectNoAwsCalls();
  });
});
