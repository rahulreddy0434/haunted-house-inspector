import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time buffer comparison. Returns false for different lengths; never throws. */
export function safeEqualBuffers(a: Uint8Array, b: Uint8Array): boolean {
  try {
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Both inputs are hashed first, so the compared buffers are always 32 bytes
 * and there is no length-dependent early exit.
 */
export function digestsEqual(a: string, b: string): boolean {
  return safeEqualBuffers(
    createHash('sha256').update(a, 'utf8').digest(),
    createHash('sha256').update(b, 'utf8').digest(),
  );
}

/** True only when `expected` is a non-empty string equal to `submitted`. No trimming. */
export function isAccessCodeValid(submitted: unknown, expected: unknown): boolean {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;
  if (expected.length === 0) return false;
  return digestsEqual(submitted, expected);
}
