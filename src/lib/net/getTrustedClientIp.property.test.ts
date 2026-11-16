// @vitest-environment node
import { isIP } from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';
import {
  getTrustedClientIp,
  TRUSTED_PROXY_HOPS,
  UNKNOWN_CLIENT_IP,
} from '@/lib/net/getTrustedClientIp';
import { hashClientIp } from '@/lib/pro/ipHash';
import { checkRateLimit } from '@/lib/rateLimiter';

vi.mock('server-only', () => ({}));

const counter = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('@/lib/aws/dynamodb', () => ({
  incrementRateLimitCounter: async (visitorId: string) => {
    counter.ids.push(visitorId);
    return { allowed: true, count: 1, windowStart: 0 };
  },
}));

// Feature: pro-dashboard-and-booking, Property 6: Trusted client IP ignores client-supplied entries
// **Validates: Requirements 2.2, 18.3, 18.4, 18.5, 18.6, 16.18**

const RUNS = { numRuns: 100 };

const noComma = (s: string): boolean => !s.includes(',');

const ipArb = fc.oneof(fc.ipV4(), fc.ipV6());
const hopsArb = fc.constantFrom(1, 2);

const prefixEntryArb = fc
  .oneof(fc.ipV4(), fc.ipV6(), fc.constant(''), fc.constant('  '), fc.string())
  .filter(noComma);
const prefixArb = fc.array(prefixEntryArb, { minLength: 0, maxLength: 5 });

function buildHeader(prefix: string[], trusted: string, tail: string[]): string {
  return [...prefix, trusted, ...tail].join(', ');
}

const headersFor = (value: string): Headers => new Headers({ 'x-forwarded-for': value });

describe('Property 6: Trusted client IP ignores client-supplied entries', () => {
  it('returns the trusted entry lowercased regardless of the prefix', () => {
    fc.assert(
      fc.property(hopsArb, ipArb, prefixArb, (hops, trusted, prefix) => {
        const tail = Array.from({ length: hops - 1 }, () => '10.0.0.1');
        const header = buildHeader(prefix, trusted, tail);
        expect(getTrustedClientIp(headersFor(header), hops)).toBe(trusted.toLowerCase());
      }),
      RUNS,
    );
  });

  it('changing only the prefix never changes the result', () => {
    fc.assert(
      fc.property(
        hopsArb,
        ipArb,
        prefixArb,
        prefixArb,
        (hops, trusted, prefixA, prefixB) => {
          const tail = Array.from({ length: hops - 1 }, () => '10.0.0.2');
          const a = getTrustedClientIp(headersFor(buildHeader(prefixA, trusted, tail)), hops);
          const b = getTrustedClientIp(headersFor(buildHeader(prefixB, trusted, tail)), hops);
          expect(a).toBe(b);
          expect(a).toBe(trusted.toLowerCase());
        },
      ),
      RUNS,
    );
  });

  it('accepts a plain record of headers with the same result as a Headers object', () => {
    fc.assert(
      fc.property(hopsArb, ipArb, prefixArb, (hops, trusted, prefix) => {
        const tail = Array.from({ length: hops - 1 }, () => '10.0.0.3');
        const header = buildHeader(prefix, trusted, tail);
        expect(getTrustedClientIp({ 'X-Forwarded-For': header }, hops)).toBe(
          getTrustedClientIp(headersFor(header), hops),
        );
      }),
      RUNS,
    );
  });

  it('gives unknown for an absent header', () => {
    fc.assert(
      fc.property(hopsArb, fc.ipV4(), (hops, other) => {
        expect(getTrustedClientIp(new Headers(), hops)).toBe(UNKNOWN_CLIENT_IP);
        expect(getTrustedClientIp({}, hops)).toBe(UNKNOWN_CLIENT_IP);
        // other headers alone never produce an address
        expect(
          getTrustedClientIp(new Headers({ 'x-real-ip': other, 'cloudfront-viewer-address': `${other}:443` }), hops),
        ).toBe(UNKNOWN_CLIENT_IP);
      }),
      RUNS,
    );
  });

  it('gives unknown for a header with fewer entries than hops', () => {
    fc.assert(
      fc.property(
        hopsArb,
        fc.array(fc.ipV4(), { minLength: 0, maxLength: 1 }),
        (hops, entries) => {
          fc.pre(entries.length < hops);
          expect(getTrustedClientIp(headersFor(entries.join(', ')), hops)).toBe(UNKNOWN_CLIENT_IP);
        },
      ),
      RUNS,
    );
  });

  it('gives unknown when the trusted entry is not an IP literal', () => {
    fc.assert(
      fc.property(
        hopsArb,
        fc
          .string()
          .filter((s) => noComma(s) && isIP(s.trim()) === 0),
        prefixArb,
        (hops, invalid, prefix) => {
          const tail = Array.from({ length: hops - 1 }, () => '10.0.0.4');
          const header = buildHeader(prefix, invalid, tail);
          expect(getTrustedClientIp(headersFor(header), hops)).toBe(UNKNOWN_CLIENT_IP);
        },
      ),
      RUNS,
    );
  });

  it('gives unknown when the trusted entry carries a port', () => {
    fc.assert(
      fc.property(
        hopsArb,
        fc.ipV4(),
        fc.integer({ min: 0, max: 65535 }),
        prefixArb,
        (hops, ip, port, prefix) => {
          const tail = Array.from({ length: hops - 1 }, () => '10.0.0.5');
          const header = buildHeader(prefix, `${ip}:${port}`, tail);
          expect(getTrustedClientIp(headersFor(header), hops)).toBe(UNKNOWN_CLIENT_IP);
        },
      ),
      RUNS,
    );
  });

  it('extra headers never change the result', () => {
    fc.assert(
      fc.property(
        hopsArb,
        ipArb,
        prefixArb,
        fc.ipV4(),
        fc.ipV4(),
        fc.integer({ min: 0, max: 65535 }),
        (hops, trusted, prefix, realIp, viewerIp, port) => {
          const tail = Array.from({ length: hops - 1 }, () => '10.0.0.6');
          const header = buildHeader(prefix, trusted, tail);
          const plain = getTrustedClientIp(headersFor(header), hops);
          const withExtras = getTrustedClientIp(
            new Headers({
              'x-forwarded-for': header,
              'x-real-ip': realIp,
              'cloudfront-viewer-address': `${viewerIp}:${port}`,
            }),
            hops,
          );
          expect(withExtras).toBe(plain);
          expect(withExtras).toBe(trusted.toLowerCase());
        },
      ),
      RUNS,
    );
  });

  describe('Hashed_IP and rate limiter visitor id', () => {
    const SECRET = 'test-secret';

    beforeEach(() => {
      counter.ids.length = 0;
      delete process.env.SESSION_SECRET;
    });

    async function visitorIdFor(header: string | null): Promise<string> {
      const headers: Record<string, string> = header === null ? {} : { 'x-forwarded-for': header };
      counter.ids.length = 0;
      await checkRateLimit(new NextRequest('http://localhost/api/inspect', { headers }));
      return counter.ids[0];
    }

    it('hashes the same value with or without a spoofed prefix', () => {
      fc.assert(
        fc.property(hopsArb, ipArb, prefixArb, (hops, trusted, prefix) => {
          const tail = Array.from({ length: hops - 1 }, () => '10.0.0.7');
          const withPrefix = getTrustedClientIp(headersFor(buildHeader(prefix, trusted, tail)), hops);
          const suffixOnly = getTrustedClientIp(headersFor(buildHeader([], trusted, tail)), hops);
          expect(hashClientIp(withPrefix, SECRET)).toBe(hashClientIp(suffixOnly, SECRET));
        }),
        RUNS,
      );
    });

    it('gives the visitor id of the trusted suffix alone, whatever the prefix', async () => {
      await fc.assert(
        fc.asyncProperty(ipArb, prefixArb, async (trusted, prefix) => {
          const tail = Array.from({ length: TRUSTED_PROXY_HOPS - 1 }, () => '10.0.0.8');
          const withPrefix = await visitorIdFor(buildHeader(prefix, trusted, tail));
          const suffixOnly = await visitorIdFor(buildHeader([], trusted, tail));
          expect(withPrefix).toBe(suffixOnly);
        }),
        RUNS,
      );
    });

    it('gives the unknown hash for absent or malformed trusted values', () => {
      const unknownHash = hashClientIp(UNKNOWN_CLIENT_IP, SECRET);
      fc.assert(
        fc.property(
          hopsArb,
          fc.string().filter((s) => noComma(s) && isIP(s.trim()) === 0),
          prefixArb,
          (hops, invalid, prefix) => {
            const tail = Array.from({ length: hops - 1 }, () => '10.0.0.9');
            const malformed = getTrustedClientIp(headersFor(buildHeader(prefix, invalid, tail)), hops);
            expect(hashClientIp(malformed, SECRET)).toBe(unknownHash);
            expect(hashClientIp(getTrustedClientIp(new Headers(), hops), SECRET)).toBe(unknownHash);
            const short = getTrustedClientIp(headersFor(''), hops);
            expect(hashClientIp(short, SECRET)).toBe(unknownHash);
          },
        ),
        RUNS,
      );
    });

    it('gives the unknown visitor id for absent or malformed trusted values', async () => {
      const unknownId = await visitorIdFor(null);
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter((s) => noComma(s) && isIP(s.trim()) === 0),
          prefixArb,
          async (invalid, prefix) => {
            const tail = Array.from({ length: TRUSTED_PROXY_HOPS - 1 }, () => '10.0.0.10');
            expect(await visitorIdFor(buildHeader(prefix, invalid, tail))).toBe(unknownId);
          },
        ),
        RUNS,
      );
    });
  });
});
