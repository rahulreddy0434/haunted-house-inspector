// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashClientIp } from '@/lib/pro/ipHash';

const SECRET = 'test-secret';

describe('hashClientIp', () => {
  it('returns 64 lowercase hex characters', () => {
    expect(hashClientIp('203.0.113.7', SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashClientIp('203.0.113.7', SECRET)).toBe(hashClientIp('203.0.113.7', SECRET));
  });

  it('gives a different hash for a different IP', () => {
    expect(hashClientIp('203.0.113.7', SECRET)).not.toBe(hashClientIp('203.0.113.8', SECRET));
  });

  it('gives a different hash for a different secret', () => {
    expect(hashClientIp('203.0.113.7', 'secret-a')).not.toBe(hashClientIp('203.0.113.7', 'secret-b'));
  });

  it("uses the 'proauth-ip:' prefix", () => {
    const expected = createHmac('sha256', SECRET).update('proauth-ip:203.0.113.7').digest('hex');
    expect(hashClientIp('203.0.113.7', SECRET)).toBe(expected);
    const unprefixed = createHmac('sha256', SECRET).update('203.0.113.7').digest('hex');
    expect(hashClientIp('203.0.113.7', SECRET)).not.toBe(unprefixed);
  });

  it.each(['203.0.113.7', '2001:db8::8a2e:370:7334'])('never contains the raw IP (%s)', (ip) => {
    const hash = hashClientIp(ip, SECRET);
    expect(hash).not.toContain(ip);
    expect(hash).not.toContain(ip.replace(/[.:]/g, ''));
  });

  it("hashes 'unknown' like any other value", () => {
    const hash = hashClientIp('unknown', SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHmac('sha256', SECRET).update('proauth-ip:unknown').digest('hex'));
    expect(hash).not.toContain('unknown');
  });
});
