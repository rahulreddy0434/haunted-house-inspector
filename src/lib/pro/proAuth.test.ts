// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

import {
  buildLoginCookie,
  buildLogoutCookie,
  readProConfig,
  requirePro,
} from '@/lib/pro/proAuth';
import { PRO_COOKIE_NAME, signProCookie } from '@/lib/pro/proCookie';
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

const NOW = 1_700_000_000_000;

let restoreEnv: () => void;
let spies: ConsoleSpies;

beforeEach(() => {
  restoreEnv = withEnv({ PRO_ACCESS_CODE: TEST_ACCESS_CODE, SESSION_SECRET: TEST_SECRET });
  spies = consoleSpies();
});

afterEach(() => {
  spies.restore();
  restoreEnv();
});

async function expectUnauthorized(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  const body = (await response.json()) as { error?: unknown };
  expect(body.error).toBe('UNAUTHORIZED');
  expectNoStore(response);
}

describe('readProConfig', () => {
  it('returns the configured values', () => {
    expect(readProConfig()).toEqual({
      ok: true,
      accessCode: TEST_ACCESS_CODE,
      secret: TEST_SECRET,
    });
    expect(spies.warn).not.toHaveBeenCalled();
  });

  it('re-reads the environment on every call', () => {
    expect(readProConfig().ok).toBe(true);
    process.env.PRO_ACCESS_CODE = '';
    expect(readProConfig()).toEqual({ ok: false });
    process.env.PRO_ACCESS_CODE = 'another-fake-code';
    process.env.SESSION_SECRET = 'another-fake-secret';
    expect(readProConfig()).toEqual({
      ok: true,
      accessCode: 'another-fake-code',
      secret: 'another-fake-secret',
    });
    delete process.env.SESSION_SECRET;
    expect(readProConfig()).toEqual({ ok: false });
  });

  it('warns naming only the missing variable and never logs a value', () => {
    delete process.env.PRO_ACCESS_CODE;
    expect(readProConfig()).toEqual({ ok: false });
    let text = spies.loggedText();
    expect(text).toContain('PRO_ACCESS_CODE');
    expect(text).not.toContain('SESSION_SECRET');
    expect(text).not.toContain(TEST_SECRET);
    expect(text).not.toContain(TEST_ACCESS_CODE);

    process.env.PRO_ACCESS_CODE = TEST_ACCESS_CODE;
    process.env.SESSION_SECRET = '';
    spies.warn.mockClear();
    expect(readProConfig()).toEqual({ ok: false });
    text = spies.loggedText();
    expect(text).toContain('SESSION_SECRET');
    expect(text).not.toContain('PRO_ACCESS_CODE');
    expect(text).not.toContain(TEST_ACCESS_CODE);
    expect(text).not.toContain(TEST_SECRET);
  });

  it('does not log secret text when requirePro rejects a request', () => {
    requirePro(makeRequest('/api/pro/jobs', { cookie: 'tampered.value' }), NOW);
    const text = spies.loggedText();
    expect(text).not.toContain(TEST_SECRET);
    expect(text).not.toContain(TEST_ACCESS_CODE);
    expect(text).not.toContain('tampered.value');
  });
});

describe('cookie builders', () => {
  it('builds the login cookie', () => {
    expect(buildLoginCookie('abc')).toEqual({
      name: PRO_COOKIE_NAME,
      value: 'abc',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/pro',
      maxAge: 43200,
    });
  });

  it('builds the logout cookie', () => {
    expect(buildLogoutCookie()).toEqual({
      name: PRO_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/pro',
      maxAge: 0,
    });
  });

  it('produces the expected Set-Cookie header for login', () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(buildLoginCookie('abc'));
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain(`${PRO_COOKIE_NAME}=abc`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toMatch(/SameSite=strict/i);
    expect(header).toContain('Path=/api/pro');
    expect(header).toContain('Max-Age=43200');
  });

  it('produces the expected Set-Cookie header for logout', () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(buildLogoutCookie());
    const header = res.headers.get('set-cookie') ?? '';
    expect(header).toContain(`${PRO_COOKIE_NAME}=;`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toMatch(/SameSite=strict/i);
    expect(header).toContain('Path=/api/pro');
    expect(header).toContain('Max-Age=0');
  });
});

describe('requirePro', () => {
  it('returns { ok: true } for a valid cookie', () => {
    const guard = requirePro(makeRequest('/api/pro/jobs', { cookie: validProCookie(NOW) }), NOW);
    expect(guard).toEqual({ ok: true });
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
  ])('returns 401 when SESSION_SECRET is %s, even with an otherwise valid cookie', async (_n, value) => {
    const cookie = validProCookie(NOW);
    if (value === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = value;
    }
    const guard = requirePro(makeRequest('/api/pro/jobs', { cookie }), NOW);
    expect(guard.ok).toBe(false);
    if (!guard.ok) await expectUnauthorized(guard.response);
  });

  const cases: Array<[string, () => string | undefined]> = [
    ['absent', () => undefined],
    ['malformed', () => 'not-a-cookie'],
    ['tampered', () => {
      const good = validProCookie(NOW);
      const [payload, sig] = good.split('.');
      const forged = Buffer.from(JSON.stringify({ role: 'pro', exp: NOW + 10 ** 12 })).toString(
        'base64url',
      );
      return payload === forged ? `${payload}.${sig}x` : `${forged}.${sig}`;
    }],
    ['wrong-secret', () => validProCookie(NOW, 'a-different-fake-secret')],
    ['expired', () => signProCookie({ role: 'pro', exp: NOW - 1 }, TEST_SECRET)],
  ];

  it.each(cases)('returns 401 for an %s cookie', async (_name, make) => {
    const cookie = make();
    const request = makeRequest('/api/pro/jobs', cookie === undefined ? {} : { cookie });
    const guard = requirePro(request, NOW);
    expect(guard.ok).toBe(false);
    if (!guard.ok) await expectUnauthorized(guard.response);
  });

  it('returns 401 for a valid hhi_session cookie without a Pro cookie', async () => {
    const session = `hhi_session=${validProCookie(NOW)}`;
    const guard = requirePro(makeRequest('/api/pro/jobs', { cookie: session }), NOW);
    expect(guard.ok).toBe(false);
    if (!guard.ok) await expectUnauthorized(guard.response);
  });
});
