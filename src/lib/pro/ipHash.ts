import { createHmac } from 'node:crypto';

/**
 * One-way keyed hash of the trusted client IP (the value returned by
 * `getTrustedClientIp`, including the constant 'unknown').
 * Returns 64 lowercase hex characters. The raw IP is never stored, logged or returned.
 * Pure: no I/O, no AWS, no `server-only`.
 */
export function hashClientIp(trustedIp: string, secret: string): string {
  return createHmac('sha256', secret).update('proauth-ip:' + trustedIp).digest('hex');
}
