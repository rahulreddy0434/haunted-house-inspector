import type { ChatAccess } from '@/types/chat';

export const FAST_INTERVAL_MS = 5_000;
export const SLOW_INTERVAL_MS = 30_000;
export const QUIET_PERIOD_MS = 120_000;

/**
 * null = do not poll. Pure.
 * access != 'open' -> null; !visible -> null;
 * msSinceActivity >= QUIET_PERIOD_MS -> 30000; otherwise 5000.
 */
export function pollDelayMs(input: {
  access: ChatAccess;
  visible: boolean;
  msSinceActivity: number;
}): number | null {
  if (input.access !== 'open') return null;
  if (!input.visible) return null;
  return input.msSinceActivity >= QUIET_PERIOD_MS ? SLOW_INTERVAL_MS : FAST_INTERVAL_MS;
}
