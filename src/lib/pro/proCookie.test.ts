// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { incrementMock } = vi.hoisted(() => ({ incrementMock: vi.fn() }));
vi.mock('@/lib/aws/dynamodb', () => ({ incrementRateLimitCounter: incrementMock }));

import { signSessionToken, verifySessionToken } from '@/lib/rateLimiter';
import {
  PRO_COOKIE_MAX_AGE_SECONDS,
  PRO_COOKIE_NAME,
  PRO_COOKIE_PATH,
  issueProCookie,
  signProCookie,
  verifyProCookie,
} from './proCookie';

const SECRET = 'test-secret-value';
const NOW = 1_700_000_000_000;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const b64 = (v: Buffer | string): string => Buffer.from(v).toString('base64url');

function cookieWithExp(exp: number, secret = SECRET): string {
  return signProCookie({ role: 'pro', exp }, secret);
}

describe('constants', () => {
  it('exposes the cookie name, path and max age', () => {
    expect(PRO_COOKIE_NAME).toBe('hhi_pro');
    expect(PRO_COOKIE_PATH).toBe('/api/pro');
    expect(PRO_COOKIE_MAX_AGE_SECONDS).toBe(43200);
  });
});

describe('issueProCookie and expiry', () => {
  it('sets exp = now + 12 hours', () => {
    const token = issueProCookie(SECRET, NOW);
    const payload = verifyProCookie(token, SECRET, NOW);
    expect(payload).toEqual({ role: 'pro', exp: NOW + 12 * 60 * 60 * 1000 });
  });

  it('returns an empty value for an empty secret', () => {
    expect(issueProCookie('', NOW)).toBe('');
  });

  it('passes at exp - 1, fails at exp and exp + 1', () => {
    const exp = NOW + 1000;
    const token = cookieWithExp(exp);
    expect(verifyProCookie(token, SECRET, exp - 1)).toEqual({ role: 'pro', exp });
    expect(verifyProCookie(token, SECRET, exp)).toBeNull();
    expect(verifyProCookie(token, SECRET, exp + 1)).toBeNull();
  });
});

describe('tampering and secrets', () => {
  it('rejects a tampered payload', () => {
    const [, sig] = cookieWithExp(NOW + 1000).split('.');
    const forged = b64(JSON.stringify({ role: 'pro', exp: NOW + 999_999_999 }));
    expect(verifyProCookie(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const [p, sig] = cookieWithExp(NOW + 1000).split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyProCookie(`${p}.${flipped}`, SECRET, NOW)).toBeNull();
  });

  it('rejects a wrong secret', () => {
    expect(verifyProCookie(cookieWithExp(NOW + 1000), 'other-secret', NOW)).toBeNull();
  });

  it('returns null for an empty secret, and an empty-key cookie never verifies', () => {
    const valid = cookieWithExp(NOW + 1000);
    expect(verifyProCookie(valid, '', NOW)).toBeNull();
    const emptyKeyed = cookieWithExp(NOW + 1000, '');
    expect(verifyProCookie(emptyKeyed, '', NOW)).toBeNull();
    expect(verifyProCookie(emptyKeyed, SECRET, NOW)).toBeNull();
    expect(verifyProCookie(emptyKeyed, 'x', NOW)).toBeNull();
  });
});

describe('malformed values', () => {
  it('rejects a non-token string', () => {
    expect(verifyProCookie('not a token', SECRET, NOW)).toBeNull();
  });

  it('rejects the wrong number of dot-separated parts', () => {
    const [p, s] = cookieWithExp(NOW + 1000).split('.');
    expect(verifyProCookie('', SECRET, NOW)).toBeNull(); // 0 dots
    expect(verifyProCookie(p, SECRET, NOW)).toBeNull(); // 0 dots
    expect(verifyProCookie(`${p}${s}`, SECRET, NOW)).toBeNull();
    expect(verifyProCookie(`${p}.${s}.${s}`, SECRET, NOW)).toBeNull(); // 2 dots
    expect(verifyProCookie(`${p}.${s}.x.y`, SECRET, NOW)).toBeNull(); // 3 dots
  });

  it('returns null for undefined and null', () => {
    expect(verifyProCookie(undefined, SECRET, NOW)).toBeNull();
    expect(verifyProCookie(null, SECRET, NOW)).toBeNull();
  });

  it('never throws on odd input', () => {
    const odd = ['.', '..', 'a.b', '%%%.%%%', '\u0000.\u0000', 'é.é', 'a'.repeat(10_000), '.'.repeat(50)];
    for (const v of odd) {
      expect(() => verifyProCookie(v, SECRET, NOW)).not.toThrow();
      expect(verifyProCookie(v, SECRET, NOW)).toBeNull();
    }
    expect(() => verifyProCookie(123 as unknown as string, SECRET, NOW)).not.toThrow();
    expect(() => verifyProCookie(cookieWithExp(NOW + 1), SECRET, Number.NaN)).not.toThrow();
  });
});

describe('purpose prefix', () => {
  it('rejects a token whose MAC was computed without the pro: prefix', () => {
    const payloadPart = b64(JSON.stringify({ role: 'pro', exp: NOW + 1000 }));
    const sig = b64(createHmac('sha256', SECRET).update(payloadPart).digest());
    expect(verifyProCookie(`${payloadPart}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('accepts the same payload when the MAC uses the prefix', () => {
    const payloadPart = b64(JSON.stringify({ role: 'pro', exp: NOW + 1000 }));
    const sig = b64(createHmac('sha256', SECRET).update(`pro:${payloadPart}`).digest());
    expect(verifyProCookie(`${payloadPart}.${sig}`, SECRET, NOW)).not.toBeNull();
  });
});

describe('payload shape', () => {
  function signRaw(payload: unknown): string {
    const payloadPart = b64(JSON.stringify(payload));
    const sig = b64(createHmac('sha256', SECRET).update(`pro:${payloadPart}`).digest());
    return `${payloadPart}.${sig}`;
  }

  it('rejects a role other than pro', () => {
    expect(verifyProCookie(signRaw({ role: 'admin', exp: NOW + 1000 }), SECRET, NOW)).toBeNull();
    expect(verifyProCookie(signRaw({ exp: NOW + 1000 }), SECRET, NOW)).toBeNull();
  });

  it('rejects a non-integer or non-number exp', () => {
    expect(verifyProCookie(signRaw({ role: 'pro', exp: NOW + 1000.5 }), SECRET, NOW)).toBeNull();
    expect(verifyProCookie(signRaw({ role: 'pro', exp: String(NOW + 1000) }), SECRET, NOW)).toBeNull();
    expect(verifyProCookie(signRaw({ role: 'pro' }), SECRET, NOW)).toBeNull();
    expect(verifyProCookie(signRaw(null), SECRET, NOW)).toBeNull();
  });
});

describe('cross-cookie isolation', () => {
  it('rejects a valid hhi_session token', () => {
    const session = signSessionToken({ visitorId: 'v1', count: 1, windowStart: NOW }, SECRET);
    expect(verifySessionToken(session, SECRET)).not.toBeNull();
    expect(verifyProCookie(session, SECRET, NOW)).toBeNull();
  });

  it('is rejected by verifySessionToken when it is a valid Pro cookie', () => {
    const pro = issueProCookie(SECRET, NOW);
    expect(verifyProCookie(pro, SECRET, NOW)).not.toBeNull();
    expect(verifySessionToken(pro, SECRET)).toBeNull();
  });
});

describe('canonical base64url signature', () => {
  const valid = cookieWithExp(NOW + 60_000);
  const [payloadPart, sig] = valid.split('.');

  it('accepts the canonical form', () => {
    expect(verifyProCookie(valid, SECRET, NOW)).not.toBeNull();
    expect(sig).toHaveLength(43);
  });

  it('rejects a signature with its last character changed', () => {
    const last = sig[sig.length - 1];
    const other = ALPHABET[(ALPHABET.indexOf(last) + 16) % 64];
    expect(verifyProCookie(`${payloadPart}.${sig.slice(0, -1)}${other}`, SECRET, NOW)).toBeNull();
  });

  it('rejects extra characters appended', () => {
    expect(verifyProCookie(`${payloadPart}.${sig}A`, SECRET, NOW)).toBeNull();
    expect(verifyProCookie(`${payloadPart}.${sig}AAAA`, SECRET, NOW)).toBeNull();
  });

  it('rejects a padded signature', () => {
    expect(verifyProCookie(`${payloadPart}.${sig}=`, SECRET, NOW)).toBeNull();
  });

  it('rejects a non-canonical encoding of the same 32 bytes', () => {
    // The last base64url char carries 4 data bits and 2 unused low bits.
    const idx = ALPHABET.indexOf(sig[sig.length - 1]);
    const altered = ALPHABET[idx ^ 1];
    const nonCanonical = `${sig.slice(0, -1)}${altered}`;
    expect(Buffer.from(nonCanonical, 'base64url').equals(Buffer.from(sig, 'base64url'))).toBe(true);
    expect(nonCanonical).not.toBe(sig);
    expect(verifyProCookie(`${payloadPart}.${nonCanonical}`, SECRET, NOW)).toBeNull();
  });
});
