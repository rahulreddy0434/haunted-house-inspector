// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  TRUSTED_PROXY_HOPS,
  UNKNOWN_CLIENT_IP,
  getTrustedClientIp,
} from '@/lib/net/getTrustedClientIp';

const xff = (value: string) => new Headers({ 'x-forwarded-for': value });

describe('getTrustedClientIp', () => {
  describe('default hops', () => {
    it('uses the exported TRUSTED_PROXY_HOPS constant', () => {
      const h = xff('9.9.9.9, 1.1.1.1, 2.2.2.2');
      expect(getTrustedClientIp(h)).toBe(getTrustedClientIp(h, TRUSTED_PROXY_HOPS));
    });

    it('currently equals 2', () => {
      // Updated whenever TRUSTED_PROXY_HOPS is re-verified against a live diagnostic.
      expect(TRUSTED_PROXY_HOPS).toBe(2);
    });
  });

  describe('entry selection', () => {
    it('single entry with hops 1 returns it', () => {
      expect(getTrustedClientIp(xff('1.2.3.4'), 1)).toBe('1.2.3.4');
    });

    it('single entry with the default hops (2) gives unknown', () => {
      expect(getTrustedClientIp(xff('1.2.3.4'))).toBe(UNKNOWN_CLIENT_IP);
    });

    it('picks the right entry from three with hops 1 and 2', () => {
      const h = xff('1.1.1.1, 2.2.2.2, 3.3.3.3');
      expect(getTrustedClientIp(h, 1)).toBe('3.3.3.3');
      expect(getTrustedClientIp(h, 2)).toBe('2.2.2.2');
      expect(getTrustedClientIp(h, 3)).toBe('1.1.1.1');
    });

    it('gives unknown when there are fewer entries than hops', () => {
      expect(getTrustedClientIp(xff('1.1.1.1, 2.2.2.2'), 3)).toBe(UNKNOWN_CLIENT_IP);
    });

    it('trims whitespace around entries', () => {
      expect(getTrustedClientIp(xff('  1.1.1.1 ,\t2.2.2.2  ,  3.3.3.3  '), 2)).toBe('2.2.2.2');
    });

    it('treats an empty entry between commas as a position (implemented behaviour)', () => {
      // '1.1.1.1,,2.2.2.2' splits into three entries: '1.1.1.1', '', '2.2.2.2'.
      const h = xff('1.1.1.1,,2.2.2.2');
      expect(getTrustedClientIp(h, 1)).toBe('2.2.2.2');
      expect(getTrustedClientIp(h, 2)).toBe(UNKNOWN_CLIENT_IP); // the empty entry is not an IP
      expect(getTrustedClientIp(h, 3)).toBe('1.1.1.1');
    });
  });

  describe('entry validation', () => {
    it('gives unknown for an address with a port suffix', () => {
      expect(getTrustedClientIp(xff('1.2.3.4:5678'), 1)).toBe(UNKNOWN_CLIENT_IP);
    });

    it('accepts IPv6 and lowercases it', () => {
      expect(getTrustedClientIp(xff('2001:DB8::ABCD'), 1)).toBe('2001:db8::abcd');
    });

    it('gives unknown for an invalid trusted entry', () => {
      expect(getTrustedClientIp(xff('1.1.1.1, not-an-ip, 3.3.3.3'), 2)).toBe(UNKNOWN_CLIENT_IP);
    });

    it('ignores an invalid entry left of the trusted position', () => {
      expect(getTrustedClientIp(xff('garbage, 2.2.2.2'), 1)).toBe('2.2.2.2');
    });
  });

  describe('missing header', () => {
    it('gives unknown for an empty header', () => {
      expect(getTrustedClientIp(xff(''), 1)).toBe(UNKNOWN_CLIENT_IP);
      expect(getTrustedClientIp(xff('   '), 1)).toBe(UNKNOWN_CLIENT_IP);
    });

    it('gives unknown for an absent header', () => {
      expect(getTrustedClientIp(new Headers(), 1)).toBe(UNKNOWN_CLIENT_IP);
      expect(getTrustedClientIp({}, 1)).toBe(UNKNOWN_CLIENT_IP);
    });
  });

  describe('invalid hops', () => {
    const h = xff('1.1.1.1, 2.2.2.2');
    it.each([0, -1, -2, 1.5, NaN, Infinity])('gives unknown for hops %s', (hops) => {
      expect(getTrustedClientIp(h, hops)).toBe(UNKNOWN_CLIENT_IP);
    });
  });

  describe('other headers', () => {
    it('never uses cloudfront-viewer-address, x-real-ip or forwarded', () => {
      const h = new Headers({
        'cloudfront-viewer-address': '5.5.5.5:1234',
        'x-real-ip': '6.6.6.6',
        forwarded: 'for=7.7.7.7',
      });
      expect(getTrustedClientIp(h, 1)).toBe(UNKNOWN_CLIENT_IP);
    });

    it('does not let other headers change the result', () => {
      const h = new Headers({
        'x-forwarded-for': '1.1.1.1, 2.2.2.2',
        'cloudfront-viewer-address': '5.5.5.5:1234',
        'x-real-ip': '6.6.6.6',
        forwarded: 'for=7.7.7.7',
      });
      expect(getTrustedClientIp(h, 1)).toBe('2.2.2.2');
    });
  });

  describe('header containers', () => {
    it('works with a plain object (case-insensitive key)', () => {
      expect(getTrustedClientIp({ 'X-Forwarded-For': '1.1.1.1, 2.2.2.2' }, 1)).toBe('2.2.2.2');
    });

    it('joins an array value as separate entries', () => {
      expect(getTrustedClientIp({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] }, 2)).toBe('1.1.1.1');
    });

    it('gives unknown for an undefined plain-object value', () => {
      expect(getTrustedClientIp({ 'x-forwarded-for': undefined }, 1)).toBe(UNKNOWN_CLIENT_IP);
    });
  });
});
