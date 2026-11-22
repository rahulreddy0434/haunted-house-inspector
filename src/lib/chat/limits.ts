export const THREAD_LIMIT = 100;
export const MESSAGE_RATE_MAX = 10;
export const MESSAGE_RATE_WINDOW_MS = 60_000;

export type LimitResult =
  | { ok: true; nextSent: number[] }
  | { ok: false; reason: 'THREAD_LIMIT_REACHED' }
  | { ok: false; reason: 'MESSAGE_RATE_LIMITED'; retryAfterSeconds: number };

/**
 * The thread limit is checked first, then the per-Side rate limit.
 * `sent` holds the Side's recent send times (epoch ms, ascending).
 */
export function checkSendLimits(
  state: { chatSeq?: number; sent?: readonly number[] },
  nowMs: number,
): LimitResult {
  if ((state.chatSeq ?? 0) >= THREAD_LIMIT) {
    return { ok: false, reason: 'THREAD_LIMIT_REACHED' };
  }
  const recent = (state.sent ?? []).filter((t) => t > nowMs - MESSAGE_RATE_WINDOW_MS);
  if (recent.length >= MESSAGE_RATE_MAX) {
    const oldest = Math.min(...recent);
    const seconds = Math.ceil((oldest + MESSAGE_RATE_WINDOW_MS - nowMs) / 1000);
    return { ok: false, reason: 'MESSAGE_RATE_LIMITED', retryAfterSeconds: Math.max(1, seconds) };
  }
  return { ok: true, nextSent: [...recent, nowMs] };
}
