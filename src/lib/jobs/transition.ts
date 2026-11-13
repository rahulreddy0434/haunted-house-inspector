import type { JobAction, JobStatus } from '@/types/job';

export type TransitionResult =
  | { ok: true; next: JobStatus; changed: boolean } // changed=false only for emergency + safety_override
  | { ok: false; reason: 'ILLEGAL_TRANSITION' | 'JOB_IS_EMERGENCY' };

/** Keys are `${JobStatus}:${JobAction}`; 13 entries. */
export const TRANSITION_TABLE: Readonly<Record<string, JobStatus>> = {
  'new:ask_info': 'info_requested',
  'new:accept': 'accepted',
  'new:decline': 'declined',
  'info_requested:reply': 'new',
  'info_requested:accept': 'accepted',
  'info_requested:decline': 'declined',
  'accepted:book': 'booked',
  'new:safety_override': 'emergency',
  'info_requested:safety_override': 'emergency',
  'accepted:safety_override': 'emergency',
  'declined:safety_override': 'emergency',
  'booked:safety_override': 'emergency',
  'emergency:safety_override': 'emergency',
};

/**
 * Pure and total. Never throws: inputs outside the closed unions (possible at
 * runtime only) give a rejection, never an exception.
 */
export function transition(current: JobStatus, action: JobAction): TransitionResult {
  // Runtime guard: a non-string (e.g. a Symbol) would make the template literal throw.
  const known = typeof current === 'string' && typeof action === 'string';
  const key = known ? `${current}:${action}` : '';
  const next = known && Object.hasOwn(TRANSITION_TABLE, key) ? TRANSITION_TABLE[key] : undefined;
  if (next === undefined) {
    return { ok: false, reason: current === 'emergency' ? 'JOB_IS_EMERGENCY' : 'ILLEGAL_TRANSITION' };
  }
  return { ok: true, next, changed: !(current === 'emergency' && next === 'emergency') };
}

export function isTerminalStatus(s: JobStatus): boolean {
  return s === 'declined' || s === 'booked' || s === 'emergency';
}
