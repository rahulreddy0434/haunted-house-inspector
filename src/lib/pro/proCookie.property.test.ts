// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { signProCookie, verifyProCookie } from '@/lib/pro/proCookie';

// Feature: pro-dashboard-and-booking, Property 7: Pro cookie round trip and tamper resistance
// **Validates: Requirements 1.6, 3.1, 14.2, 16.11**

const RUNS = { numRuns: 100 };
const secretArb = fc.string({ minLength: 1, maxLength: 64 });
const intArb = fc.integer({ min: -1_000_000_000_000_000, max: 1_000_000_000_000_000 });

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
const REPLACEMENTS = [...BASE64URL, '.', '+', '/', '=', ' ', '\n', '%', '\u0000', 'é', '\u{1F47B}'];

describe('Property 7: Pro cookie round trip and tamper resistance', () => {
  it('sign then verify with the same secret before exp returns an equivalent payload', () => {
    fc.assert(
      fc.property(secretArb, intArb, fc.integer({ min: 1, max: 1_000_000_000_000 }), (secret, exp, gap) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        expect(verifyProCookie(token, secret, exp - gap)).toEqual({ role: 'pro', exp });
      }),
      RUNS,
    );
  });

  it('boundary: now = exp - 1 passes, now = exp fails, now > exp fails', () => {
    fc.assert(
      fc.property(secretArb, intArb, fc.integer({ min: 0, max: 1_000_000_000 }), (secret, exp, over) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        expect(verifyProCookie(token, secret, exp - 1)).toEqual({ role: 'pro', exp });
        expect(verifyProCookie(token, secret, exp + over)).toBeNull();
      }),
      RUNS,
    );
  });

  it('every single-character replacement fails verification', () => {
    fc.assert(
      fc.property(secretArb, intArb, fc.nat(), (secret, exp, n) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        const now = exp - 1;
        const i = n % token.length;
        for (const r of REPLACEMENTS) {
          if (r === token[i]) continue;
          const changed = token.slice(0, i) + r + token.slice(i + 1);
          expect(verifyProCookie(changed, secret, now)).toBeNull();
        }
      }),
      RUNS,
    );
  });

  it('every single-character deletion fails verification', () => {
    fc.assert(
      fc.property(secretArb, intArb, fc.nat(), (secret, exp, n) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        const i = n % token.length;
        const changed = token.slice(0, i) + token.slice(i + 1);
        expect(verifyProCookie(changed, secret, exp - 1)).toBeNull();
      }),
      RUNS,
    );
  });

  it('every single-character insertion fails verification', () => {
    fc.assert(
      fc.property(secretArb, intArb, fc.nat(), (secret, exp, n) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        const i = n % (token.length + 1);
        for (const r of REPLACEMENTS) {
          const changed = token.slice(0, i) + r + token.slice(i);
          expect(verifyProCookie(changed, secret, exp - 1)).toBeNull();
        }
      }),
      RUNS,
    );
  });

  it('a different secret fails', () => {
    fc.assert(
      fc.property(fc.tuple(secretArb, secretArb).filter(([a, b]) => a !== b), intArb, ([a, b], exp) => {
        const token = signProCookie({ role: 'pro', exp }, a);
        expect(verifyProCookie(token, b, exp - 1)).toBeNull();
      }),
      RUNS,
    );
  });

  it('tokens that are not exactly two dot-separated parts fail without throwing', () => {
    const segment = fc.stringMatching(/^[A-Za-z0-9_-]{0,60}$/);
    const notTwoParts = fc.oneof(
      segment, // zero dots
      fc.array(segment, { minLength: 3, maxLength: 6 }).map((p) => p.join('.')),
    );
    fc.assert(
      fc.property(secretArb, notTwoParts, fc.integer(), (secret, token, now) => {
        expect(verifyProCookie(token, secret, now)).toBeNull();
      }),
      RUNS,
    );
    // Also a valid token with extra parts appended or its dot removed.
    fc.assert(
      fc.property(secretArb, intArb, segment, (secret, exp, extra) => {
        const token = signProCookie({ role: 'pro', exp }, secret);
        expect(verifyProCookie(`${token}.${extra}`, secret, exp - 1)).toBeNull();
        expect(verifyProCookie(token.replace('.', ''), secret, exp - 1)).toBeNull();
      }),
      RUNS,
    );
  });

  it('arbitrary strings never throw and verify to null', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString()), secretArb, fc.integer(), (token, secret, now) => {
        expect(verifyProCookie(token, secret, now)).toBeNull();
      }),
      RUNS,
    );
  });
});
