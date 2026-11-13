// @vitest-environment node
import { isIP } from 'node:net';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getTrustedClientIp, UNKNOWN_CLIENT_IP } from '@/lib/net/getTrustedClientIp';

// Feature: pro-dashboard-and-booking, Property 6: Trusted client IP ignores client-supplied entries
// **Validates: Requirements 18.3, 18.4, 18.5, 18.6, 16.18**

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
});
