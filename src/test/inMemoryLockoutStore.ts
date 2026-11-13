import type { LockoutStore, ReserveResult } from '@/lib/pro/loginFlow';

export const MODEL_LOCKOUT_MAX = 5;
export const MODEL_LOCKOUT_WINDOW_MS = 900_000;

interface Entry {
  windowStart: number;
  count: number;
}

/**
 * Pure model of the lockout policy (the real DynamoDB store must match it):
 * - Fixed window per ipHash. It starts at the first attempt after the previous window ended.
 * - The window has ended when now >= windowStart + 900000; the next reserve starts a new window with count 1.
 * - count stays in 0..5. reserve increments only if count < 5 in the current window.
 * - A refused reserve returns retryAfterSeconds = clamp(ceil((windowStart + 900000 - now) / 1000), 1, 900).
 * - release decrements only if count > 0 and the window is the same one that was reserved.
 */
export function createInMemoryLockoutStore(): LockoutStore & {
  peek(ipHash: string): Readonly<Entry> | undefined;
} {
  const entries = new Map<string, Entry>();

  return {
    async reserve(ipHash: string, nowMs: number): Promise<ReserveResult> {
      const entry = entries.get(ipHash);
      if (!entry || nowMs >= entry.windowStart + MODEL_LOCKOUT_WINDOW_MS) {
        entries.set(ipHash, { windowStart: nowMs, count: 1 });
        return { allowed: true, windowStart: nowMs, count: 1 };
      }
      if (entry.count < MODEL_LOCKOUT_MAX) {
        entry.count += 1;
        return { allowed: true, windowStart: entry.windowStart, count: entry.count };
      }
      const seconds = Math.ceil((entry.windowStart + MODEL_LOCKOUT_WINDOW_MS - nowMs) / 1000);
      return {
        allowed: false,
        retryAfterSeconds: Math.min(900, Math.max(1, seconds)),
      };
    },

    async release(ipHash: string, windowStart: number): Promise<void> {
      const entry = entries.get(ipHash);
      if (entry && entry.windowStart === windowStart && entry.count > 0) {
        entry.count -= 1;
      }
    },

    peek(ipHash: string) {
      const entry = entries.get(ipHash);
      return entry ? { ...entry } : undefined;
    },
  };
}
