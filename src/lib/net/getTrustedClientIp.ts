import { isIP } from 'node:net'; // pure syntax check, no I/O

/**
 * Number of right-most x-forwarded-for entries added by trusted infrastructure,
 * counting the entry that carries the viewer address. This file is the ONLY place
 * that knows a header position (Requirement 18.8).
 *
 * A code constant, not an environment variable: change it only from a diagnostic
 * result, in a commit.
 *
 * Set from the live /api/diag/ip result on the real Amplify domain (suggestedHops = 2);
 * CloudFront appends the viewer address and one more address follows it. Re-verify with
 * a diagnostic if the hosting setup (custom domain, extra proxy) changes.
 */
export const TRUSTED_PROXY_HOPS = 2;

export const UNKNOWN_CLIENT_IP = 'unknown';

type HeaderReader = { get(name: string): string | null };
type HeaderRecord = Record<string, string | string[] | undefined>;

function toReader(headers: HeaderReader | HeaderRecord): HeaderReader {
  if (typeof (headers as HeaderReader).get === 'function') {
    return headers as HeaderReader;
  }
  const record = headers as HeaderRecord;
  return {
    get(name: string): string | null {
      const target = name.toLowerCase();
      for (const key of Object.keys(record)) {
        if (key.toLowerCase() !== target) continue;
        const value = record[key];
        if (Array.isArray(value)) return value.join(', ');
        return typeof value === 'string' ? value : null;
      }
      return null;
    },
  };
}

/**
 * Returns the client IP taken from the entry at `length - hops` of `x-forwarded-for`
 * (counted from the right), or `unknown` when it is absent, too short, or not an IP literal.
 * Entries left of that position are never read, so client-supplied prefixes have no effect.
 */
export function getTrustedClientIp(
  headers: HeaderReader | HeaderRecord,
  hops: number = TRUSTED_PROXY_HOPS,
): string {
  if (!Number.isInteger(hops) || hops < 1) return UNKNOWN_CLIENT_IP;
  const raw = toReader(headers).get('x-forwarded-for');
  if (raw === null || raw.trim() === '') return UNKNOWN_CLIENT_IP;
  const entries = raw.split(',').map((entry) => entry.trim());
  const index = entries.length - hops;
  if (index < 0) return UNKNOWN_CLIENT_IP;
  const candidate = entries[index];
  return isIP(candidate) !== 0 ? candidate.toLowerCase() : UNKNOWN_CLIENT_IP;
}
