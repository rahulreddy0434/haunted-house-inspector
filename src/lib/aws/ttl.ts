export const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/** Same formula as persistInspection: creation time in seconds plus 30 days (now when unparseable). */
export function ttlForJob(createdAt: string): number {
  const createdMs = Date.parse(createdAt);
  const baseSeconds = Number.isNaN(createdMs) ? Math.floor(Date.now() / 1000) : Math.floor(createdMs / 1000);
  return baseSeconds + THIRTY_DAYS_SECONDS;
}

/** TTL for records created at `nowMs` (epoch milliseconds), such as Help_Records. */
export function ttlFromNow(nowMs: number): number {
  return Math.floor(nowMs / 1000) + THIRTY_DAYS_SECONDS;
}
