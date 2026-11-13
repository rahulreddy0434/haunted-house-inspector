// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryLockoutStore } from '@/test/inMemoryLockoutStore';
import { attemptLogin, type LockoutStore, type ReserveResult } from '@/lib/pro/loginFlow';
import { verifyProCookie } from '@/lib/pro/proCookie';

const events: string[] = [];

vi.mock('@/lib/pro/accessCode', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pro/accessCode')>(
    '@/lib/pro/accessCode',
  );
  return {
    ...actual,
    isAccessCodeValid: vi.fn((submitted: unknown, expected: unknown) => {
      events.push('compare');
      return actual.isAccessCodeValid(submitted, expected);
    }),
  };
});

import { isAccessCodeValid } from '@/lib/pro/accessCode';

const CODE = 'correct-demo-code';
const SECRET = 'test-session-secret-value';
const IP_HASH = 'iphash-0123456789abcdef';
const RAW_IP = '203.0.113.77';
const NOW = 1_700_000_000_000;

function deps(store: LockoutStore, over: Partial<{ accessCode: string; nowMs: number }> = {}) {
  const log = vi.fn<(message: string, errorName: string) => void>();
  return {
    log,
    d: { store, accessCode: CODE, secret: SECRET, nowMs: NOW, log, ...over },
  };
}

async function failTimes(store: LockoutStore, n: number) {
  for (let i = 0; i < n; i++) {
    const { d } = deps(store);
    expect(await attemptLogin('wrong', IP_HASH, d)).toEqual({ kind: 'invalid_code' });
  }
}

beforeEach(() => {
  events.length = 0;
  vi.mocked(isAccessCodeValid).mockClear();
});

describe('attemptLogin', () => {
  it('reserves before comparing the code', async () => {
    const inner = createInMemoryLockoutStore();
    const store: LockoutStore = {
      reserve: async (h, n) => {
        events.push('reserve');
        return inner.reserve(h, n);
      },
      release: async (h, w) => {
        events.push('release');
        return inner.release(h, w);
      },
    };
    const { d } = deps(store);
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out.kind).toBe('ok');
    expect(events).toEqual(['reserve', 'compare', 'release']);
  });

  it('a refused reserve returns locked without comparing, even for the correct code', async () => {
    const store: LockoutStore = {
      reserve: async (): Promise<ReserveResult> => ({ allowed: false, retryAfterSeconds: 42 }),
      release: vi.fn(async () => undefined),
    };
    const { d } = deps(store);
    expect(await attemptLogin(CODE, IP_HASH, d)).toEqual({ kind: 'locked', retryAfterSeconds: 42 });
    expect(isAccessCodeValid).not.toHaveBeenCalled();
    expect(store.release).not.toHaveBeenCalled();
  });

  it('accepts the correct code after 4 wrong attempts and releases the attempt', async () => {
    const store = createInMemoryLockoutStore();
    await failTimes(store, 4);
    expect(store.peek(IP_HASH)?.count).toBe(4);
    const { d } = deps(store);
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out.kind).toBe('ok');
    expect(store.peek(IP_HASH)?.count).toBe(4);
  });

  it('locks the correct code after 5 wrong attempts and issues no cookie', async () => {
    const store = createInMemoryLockoutStore();
    await failTimes(store, 5);
    const { d } = deps(store);
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out.kind).toBe('locked');
    expect(out).not.toHaveProperty('cookieValue');
    expect(store.peek(IP_HASH)?.count).toBe(5);
  });

  it('reports retryAfterSeconds for the remaining window', async () => {
    const store = createInMemoryLockoutStore();
    await failTimes(store, 5); // window starts at NOW
    const { d } = deps(store, { nowMs: NOW + 100_000 });
    expect(await attemptLogin(CODE, IP_HASH, d)).toEqual({
      kind: 'locked',
      retryAfterSeconds: 800,
    });
    const { d: d2 } = deps(store, { nowMs: NOW + 899_001 });
    expect(await attemptLogin(CODE, IP_HASH, d2)).toEqual({ kind: 'locked', retryAfterSeconds: 1 });
  });

  it('returns failed with no cookie when reserve throws, logging only the error name', async () => {
    class BoomError extends Error {
      constructor() {
        super(`secret detail ${CODE} ${RAW_IP}`);
        this.name = 'BoomError';
      }
    }
    const store: LockoutStore = {
      reserve: async () => {
        throw new BoomError();
      },
      release: vi.fn(async () => undefined),
    };
    const { d, log } = deps(store);
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out).toEqual({ kind: 'failed' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toBe('BoomError');
    expect(isAccessCodeValid).not.toHaveBeenCalled();
  });

  it('a release failure still returns ok with a cookie and logs only the error name', async () => {
    const inner = createInMemoryLockoutStore();
    class ReleaseError extends Error {
      constructor() {
        super(`detail ${CODE} ${IP_HASH} ${RAW_IP}`);
        this.name = 'ReleaseError';
      }
    }
    const store: LockoutStore = {
      reserve: (h, n) => inner.reserve(h, n),
      release: async () => {
        throw new ReleaseError();
      },
    };
    const { d, log } = deps(store);
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.cookieValue.length).toBeGreaterThan(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][1]).toBe('ReleaseError');
  });

  it('uses a fallback name for non-Error throws', async () => {
    const store: LockoutStore = {
      reserve: async () => {
        throw 'string with ' + CODE;
      },
      release: async () => undefined,
    };
    const { d, log } = deps(store);
    expect(await attemptLogin(CODE, IP_HASH, d)).toEqual({ kind: 'failed' });
    expect(log.mock.calls[0][1]).toBe('UnknownError');
  });

  it('issues a cookie that verifies and expires 12 hours later', async () => {
    const { d } = deps(createInMemoryLockoutStore());
    const out = await attemptLogin(CODE, IP_HASH, d);
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    const payload = verifyProCookie(out.cookieValue, SECRET, NOW);
    expect(payload).toEqual({ role: 'pro', exp: NOW + 12 * 60 * 60 * 1000 });
    expect(verifyProCookie(out.cookieValue, SECRET, NOW + 12 * 60 * 60 * 1000)).toBeNull();
    expect(verifyProCookie(out.cookieValue, 'other-secret', NOW)).toBeNull();
  });

  it('log calls never contain the code, cookie, IP, ipHash or secret', async () => {
    const inner = createInMemoryLockoutStore();
    const failing: LockoutStore = {
      reserve: (h, n) => inner.reserve(h, n),
      release: async () => {
        throw new Error(`${CODE} ${IP_HASH} ${RAW_IP} ${SECRET}`);
      },
    };
    const a = deps(failing);
    const out = await attemptLogin(CODE, IP_HASH, a.d);
    const throwing: LockoutStore = {
      reserve: async () => {
        throw new Error(`${CODE} ${IP_HASH} ${RAW_IP} ${SECRET}`);
      },
      release: async () => undefined,
    };
    const b = deps(throwing);
    await attemptLogin(CODE, IP_HASH, b.d);

    const cookie = out.kind === 'ok' ? out.cookieValue : '';
    expect(cookie).not.toBe('');
    const logged = JSON.stringify([...a.log.mock.calls, ...b.log.mock.calls]);
    for (const secretValue of [CODE, cookie, RAW_IP, IP_HASH, SECRET]) {
      expect(logged).not.toContain(secretValue);
    }
    expect(a.log.mock.calls[0][1]).toBe('Error');
  });

  it('an empty configured access code never succeeds', async () => {
    for (const submitted of ['', 'anything', ' ']) {
      const { d } = deps(createInMemoryLockoutStore(), { accessCode: '' });
      const out = await attemptLogin(submitted, IP_HASH, d);
      expect(out).toEqual({ kind: 'invalid_code' });
    }
  });
});
