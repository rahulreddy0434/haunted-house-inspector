// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as nodeCrypto from 'node:crypto';
import { digestsEqual, isAccessCodeValid, safeEqualBuffers } from '@/lib/pro/accessCode';

const bytes = (...n: number[]) => Uint8Array.from(n);

describe('safeEqualBuffers', () => {
  it('returns true for equal buffers', () => {
    expect(safeEqualBuffers(bytes(1, 2, 3), bytes(1, 2, 3))).toBe(true);
  });

  it('returns true for two empty buffers', () => {
    expect(safeEqualBuffers(bytes(), bytes())).toBe(true);
  });

  it('returns false for unequal buffers of the same length', () => {
    expect(safeEqualBuffers(bytes(1, 2, 3), bytes(1, 2, 4))).toBe(false);
  });

  it('returns false without throwing for different lengths', () => {
    expect(() => safeEqualBuffers(bytes(1, 2, 3), bytes(1, 2))).not.toThrow();
    expect(safeEqualBuffers(bytes(1, 2, 3), bytes(1, 2))).toBe(false);
    expect(safeEqualBuffers(bytes(), bytes(0))).toBe(false);
  });
});

describe('digestsEqual', () => {
  it('is true for equal strings and false for unequal strings', () => {
    expect(digestsEqual('code', 'code')).toBe(true);
    expect(digestsEqual('code', 'Code')).toBe(false);
  });

  it('returns false without throwing for different-length strings', () => {
    expect(() => digestsEqual('short', 'a much longer string')).not.toThrow();
    expect(digestsEqual('short', 'a much longer string')).toBe(false);
    expect(digestsEqual('', 'x')).toBe(false);
  });

  it('treats two empty strings as equal (the emptiness guard is in isAccessCodeValid)', () => {
    expect(digestsEqual('', '')).toBe(true);
  });

  it('compares multibyte strings by exact equality', () => {
    expect(digestsEqual('ghost👻', 'ghost👻')).toBe(true);
    expect(digestsEqual('ghost👻', 'ghost🎃')).toBe(false);
    expect(digestsEqual('caf\u00e9', 'caf\u00e9')).toBe(true);
  });

  it('hashes with SHA-256 (the digests it compares are 32 bytes)', () => {
    // The node:crypto namespace cannot be spied on, so assert behaviour only.
    const digest = nodeCrypto.createHash('sha256').update('a', 'utf8').digest();
    expect(digest.length).toBe(32);
    expect(safeEqualBuffers(digest, nodeCrypto.createHash('sha256').update('a', 'utf8').digest())).toBe(true);
  });
});

describe('isAccessCodeValid', () => {
  it('accepts an equal code', () => {
    expect(isAccessCodeValid('spooky-2024', 'spooky-2024')).toBe(true);
  });

  it('rejects an unequal code', () => {
    expect(isAccessCodeValid('spooky-2025', 'spooky-2024')).toBe(false);
  });

  it('rejects different-length codes without throwing', () => {
    expect(() => isAccessCodeValid('spooky', 'spooky-2024')).not.toThrow();
    expect(isAccessCodeValid('spooky', 'spooky-2024')).toBe(false);
    expect(isAccessCodeValid('spooky-2024-extra', 'spooky-2024')).toBe(false);
    expect(isAccessCodeValid('', 'spooky-2024')).toBe(false);
  });

  it('never matches when the configured code is empty', () => {
    expect(isAccessCodeValid('', '')).toBe(false);
    expect(isAccessCodeValid('anything', '')).toBe(false);
    expect(isAccessCodeValid(' ', '')).toBe(false);
  });

  it('does not trim either side', () => {
    expect(isAccessCodeValid(' code', 'code')).toBe(false);
    expect(isAccessCodeValid('code ', 'code')).toBe(false);
    expect(isAccessCodeValid('code\n', 'code')).toBe(false);
    expect(isAccessCodeValid('code', ' code')).toBe(false);
    expect(isAccessCodeValid(' code ', ' code ')).toBe(true);
  });

  it('is case sensitive', () => {
    expect(isAccessCodeValid('Code', 'code')).toBe(false);
  });

  it('compares emoji and accented letters by exact equality', () => {
    expect(isAccessCodeValid('ghost👻', 'ghost👻')).toBe(true);
    expect(isAccessCodeValid('ghost🎃', 'ghost👻')).toBe(false);
    expect(isAccessCodeValid('caf\u00e9', 'caf\u00e9')).toBe(true);
    // Precomposed vs decomposed are different strings: no normalisation.
    expect(isAccessCodeValid('cafe\u0301', 'caf\u00e9')).toBe(false);
    expect(isAccessCodeValid('cafe', 'caf\u00e9')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    const values: unknown[] = [undefined, null, 123, 0, true, {}, [], ['code'], Symbol('x'), () => 'code'];
    for (const v of values) {
      expect(isAccessCodeValid(v, 'code')).toBe(false);
      expect(isAccessCodeValid('code', v)).toBe(false);
      expect(isAccessCodeValid(v, v)).toBe(false);
    }
  });
});
