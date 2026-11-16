import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDynamoTable, type FakeDynamoTable } from '@/test/fakeDynamoTable';
import { FIXTURE_NOW_MS } from '@/test/jobFixtures';
import {
  TEST_ACCESS_CODE,
  TEST_SECRET,
  consoleSpies,
  expectNoStore,
  forwardedFor,
  makeRequest,
  withEnv,
  type ConsoleSpies,
} from '@/test/proRouteHarness';
import { PRO_COOKIE_NAME, verifyProCookie } from '@/lib/pro/proCookie';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';

vi.mock('server-only', () => ({}));

// The login route must never touch the rate limiter.
vi.mock('@/lib/rateLimiter', () => {
  throw new Error('rateLimiter must not be imported by the login route');
});

const holder = vi.hoisted(() => ({ fake: null as unknown as FakeDynamoTable }));
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const { fakeDynamoMockFactory } = await import('@/test/fakeDynamoTable');
  return fakeDynamoMockFactory(() => holder.fake)(
    importOriginal as () => Promise<typeof import('@aws-sdk/lib-dynamodb')>,
  );
});

import { POST } from './route';

const WRONG_CODE = 'definitely-the-wrong-code';
const TRUSTED_IP = '198.51.100.7';

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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
  restoreEnv();
  spies.restore();
  vi.restoreAllMocks();
});

function login(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    makeRequest('/api/pro/login', {
      method: 'POST',
      body,
      headers: { 'x-forwarded-for': forwardedFor(TRUSTED_IP), ...headers },
    }) as Parameters<typeof POST>[0],
  );
}

const wrong = (headers?: Record<string, string>): Promise<Response> => login({ code: WRONG_CODE }, headers);
const correct = (headers?: Record<string, string>): Promise<Response> =>
  login({ code: TEST_ACCESS_CODE }, headers);

function cookieValue(res: Response): string | undefined {
  const header = res.headers.get('set-cookie');
  if (!header) return undefined;
  const match = new RegExp(`${PRO_COOKIE_NAME}=([^;]*)`).exec(header);
  return match?.[1];
}

function proAuthItems(): Record<string, unknown>[] {
  return [...holder.fake.items.values()].filter(
    (it) => typeof it.PK === 'string' && it.PK.startsWith('PROAUTH#'),
  );
}

async function expectInvalid(res: Response): Promise<void> {
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'INVALID_CODE' });
}

describe('POST /api/pro/login', () => {
  it('returns 200 with a hardened cookie that verifyProCookie accepts', async () => {
    const res = await correct();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expectNoStore(res);

    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=strict/i);
    expect(header).toMatch(/Path=\/api\/pro(;|$)/i);
    expect(header).toMatch(/Max-Age=43200/i);

    const value = cookieValue(res);
    expect(value).toBeTruthy();
    expect(verifyProCookie(value, TEST_SECRET, Date.now())).not.toBeNull();
  });

  it('returns 401 INVALID_CODE with no cookie for a wrong code', async () => {
    const res = await wrong();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('INVALID_CODE');
    expect(body.message).toBe("That code isn't right.");
    expect(ERROR_MESSAGES.INVALID_CODE).toBe("That code isn't right.");
    expect(res.headers.get('set-cookie')).toBeNull();
    expectNoStore(res);
  });

  it('locks after 5 wrong codes, even for a correct code on the 6th', async () => {
    for (let i = 0; i < 5; i++) await expectInvalid(await wrong());
    const res = await correct();
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('TOO_MANY_ATTEMPTS');
    const retry = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(900);
    expect(res.headers.get('set-cookie')).toBeNull();
    expectNoStore(res);
  });

  it('accepts a correct code after 4 wrong attempts', async () => {
    for (let i = 0; i < 4; i++) await expectInvalid(await wrong());
    const res = await correct();
    expect(res.status).toBe(200);
    expect(cookieValue(res)).toBeTruthy();
  });

  describe('PRO_DISABLED', () => {
    const cases: Array<[string, Record<string, string | undefined>]> = [
      ['PRO_ACCESS_CODE unset', { PRO_ACCESS_CODE: undefined }],
      ['PRO_ACCESS_CODE empty', { PRO_ACCESS_CODE: '' }],
      ['SESSION_SECRET unset', { SESSION_SECRET: undefined }],
      ['SESSION_SECRET empty', { SESSION_SECRET: '' }],
    ];
    it.each(cases)('returns 503 and touches nothing when %s', async (_name, env) => {
      const restore = withEnv(env);
      try {
        const res = await correct();
        expect(res.status).toBe(503);
        expect((await res.json()).error).toBe('PRO_DISABLED');
        expect(res.headers.get('set-cookie')).toBeNull();
        expectNoStore(res);
        expect(holder.fake.calls).toHaveLength(0);
      } finally {
        restore();
      }
    });
  });

  describe('rejected bodies are not attempts', () => {
    const rawBodies: Array<[string, unknown, number]> = [
      ['invalid JSON', '{not json', 400],
      ['missing code', {}, 400],
      ['non-string code', { code: 12345 }, 400],
      ['over max length', { code: 'a'.repeat(201) }, 400],
      ['over 4 KB', { code: 'a'.repeat(5000) }, 413],
    ];
    it.each(rawBodies)('%s returns %i-class status and is not counted', async (_name, body, status) => {
      const res = await login(body);
      expect(res.status).toBe(status);
      expect(res.headers.get('set-cookie')).toBeNull();
      expectNoStore(res);
      expect(proAuthItems()).toHaveLength(0);
    });

    it('five rejected bodies then a correct code still gives 200', async () => {
      for (const [, body, status] of rawBodies) {
        expect((await login(body)).status).toBe(status);
      }
      expect(proAuthItems()).toHaveLength(0);
      const res = await correct();
      expect(res.status).toBe(200);
      const items = proAuthItems();
      expect(items).toHaveLength(1);
      expect(items[0].count).toBe(0); // reserved, then released
    });
  });

  it('returns 500 LOGIN_FAILED with no cookie when the counter fails', async () => {
    holder.fake.send = async () => {
      throw new Error('boom with secret-ish detail');
    };
    const res = await correct();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('LOGIN_FAILED');
    expect(res.headers.get('set-cookie')).toBeNull();
    expectNoStore(res);
  });

  it('still returns 200 and the cookie when the release fails', async () => {
    const original = holder.fake.send;
    holder.fake.send = async (command: unknown) => {
      const input = ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
      if (input.UpdateExpression === 'SET #count = #count - :one') {
        throw new Error('release failed');
      }
      return original(command);
    };
    const res = await correct();
    expect(res.status).toBe(200);
    expect(verifyProCookie(cookieValue(res), TEST_SECRET, Date.now())).not.toBeNull();
    expectNoStore(res);
  });

  it('logs no raw IP, hash, code, cookie value or secret', async () => {
    const original = holder.fake.send;
    holder.fake.send = async (command: unknown) => {
      const input = ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
      if (input.UpdateExpression === 'SET #count = #count - :one') {
        throw new Error(`release failed ${TRUSTED_IP} ${TEST_ACCESS_CODE} ${TEST_SECRET}`);
      }
      return original(command);
    };
    const res = await correct();
    const value = cookieValue(res) ?? '';
    const hashes = proAuthItems().map((it) => String(it.PK).slice('PROAUTH#'.length));
    expect(hashes.length).toBeGreaterThan(0);

    holder.fake.send = async () => {
      throw new Error(`counter failed ${TRUSTED_IP} ${TEST_ACCESS_CODE} ${TEST_SECRET}`);
    };
    await wrong();

    const logged = spies.loggedText();
    expect(logged).not.toBe('');
    for (const secret of [TRUSTED_IP, TEST_ACCESS_CODE, TEST_SECRET, WRONG_CODE, value, ...hashes]) {
      expect(secret).toBeTruthy();
      expect(logged).not.toContain(secret);
    }
  });

  it('never writes RATELIMIT# items', async () => {
    await correct();
    await wrong();
    for (const call of holder.fake.calls) {
      const key = (call.input.Key ?? call.input.Item ?? {}) as Record<string, unknown>;
      expect(String(key.PK ?? '')).not.toMatch(/^RATELIMIT#/);
    }
    expect([...holder.fake.items.keys()].some((k) => k.startsWith('RATELIMIT#'))).toBe(false);
  });

  it('sets Cache-Control: no-store on 200, 400, 401, 413, 429, 500 and 503', async () => {
    const statuses = new Set<number>();
    const record = (res: Response): void => {
      statuses.add(res.status);
      expectNoStore(res);
    };
    record(await login('{bad'));
    record(await login({ code: 'a'.repeat(5000) }));
    record(await correct());
    for (let i = 0; i < 5; i++) record(await wrong());
    record(await wrong());
    holder.fake.send = async () => {
      throw new Error('boom');
    };
    record(await correct());
    const restore = withEnv({ PRO_ACCESS_CODE: undefined });
    record(await correct());
    restore();
    expect([...statuses].sort()).toEqual([200, 400, 401, 413, 429, 500, 503]);
  });

  describe('spoofed x-forwarded-for (16.19)', () => {
    it('locks on the 6th attempt even when the spoofed leading entry changes each time', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await wrong({
          'x-forwarded-for': forwardedFor(TRUSTED_IP, { spoofed: [`203.0.113.${i + 1}`] }),
        });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('does not lock a different trusted entry', async () => {
      for (let i = 0; i < 6; i++) await wrong();
      const res = await wrong({ 'x-forwarded-for': forwardedFor('192.0.2.55') });
      expect(res.status).toBe(401);
    });
  });
});
