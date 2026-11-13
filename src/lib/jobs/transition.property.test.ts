// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { transition } from '@/lib/jobs/transition';
import { JOB_ACTIONS, JOB_STATUSES, type JobAction, type JobStatus } from '@/types/job';

// Feature: pro-dashboard-and-booking, Property 1: Transition table exactness
// **Validates: Requirements 6.2, 6.3, 6.4, 6.16, 6.17, 16.2**

// The test's OWN literal copy of the Requirement 6 table (13 pairs).
const ALLOWED: ReadonlyArray<readonly [JobStatus, JobAction, JobStatus]> = [
  ['new', 'ask_info', 'info_requested'],
  ['new', 'accept', 'accepted'],
  ['new', 'decline', 'declined'],
  ['info_requested', 'reply', 'new'],
  ['info_requested', 'accept', 'accepted'],
  ['info_requested', 'decline', 'declined'],
  ['accepted', 'book', 'booked'],
  ['new', 'safety_override', 'emergency'],
  ['info_requested', 'safety_override', 'emergency'],
  ['accepted', 'safety_override', 'emergency'],
  ['declined', 'safety_override', 'emergency'],
  ['booked', 'safety_override', 'emergency'],
  ['emergency', 'safety_override', 'emergency'],
];

const TERMINAL: readonly JobStatus[] = ['declined', 'booked', 'emergency'];
const RUNS = { numRuns: 200 };

const pairArb = fc.tuple(fc.constantFrom(...JOB_STATUSES), fc.constantFrom(...JOB_ACTIONS));
const lookup = (s: JobStatus, a: JobAction) => ALLOWED.find(([cs, ca]) => cs === s && ca === a);

describe('Property 1: Transition table exactness', () => {
  it('has 13 allowed pairs out of 36', () => {
    expect(ALLOWED).toHaveLength(13);
    expect(JOB_STATUSES.length * JOB_ACTIONS.length).toBe(36);
  });

  it('succeeds exactly for the allowed pairs and rejects every other pair', () => {
    fc.assert(
      fc.property(pairArb, ([s, a]) => {
        const r = transition(s, a);
        const hit = lookup(s, a);
        if (hit) {
          expect(r).toEqual({ ok: true, next: hit[2], changed: !(s === 'emergency') });
        } else {
          expect(r).toEqual({
            ok: false,
            reason: s === 'emergency' ? 'JOB_IS_EMERGENCY' : 'ILLEGAL_TRANSITION',
          });
        }
      }),
      RUNS,
    );
  });

  it('rejects ask_info while info_requested', () => {
    expect(transition('info_requested', 'ask_info')).toEqual({ ok: false, reason: 'ILLEGAL_TRANSITION' });
  });

  it('terminal statuses reject everything except safety_override', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TERMINAL), fc.constantFrom(...JOB_ACTIONS), (s, a) => {
        const r = transition(s, a);
        if (a === 'safety_override') {
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.next).toBe('emergency');
        } else {
          expect(r.ok).toBe(false);
        }
      }),
      RUNS,
    );
  });

  it('returns emergency only for safety_override', () => {
    fc.assert(
      fc.property(pairArb, ([s, a]) => {
        const r = transition(s, a);
        if (r.ok && r.next === 'emergency') expect(a).toBe('safety_override');
      }),
      RUNS,
    );
  });

  it('sequences of 0 to 20 actions starting at emergency end at emergency', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...JOB_ACTIONS), { minLength: 0, maxLength: 20 }), (actions) => {
        const end = actions.reduce<JobStatus>((cur, a) => {
          const r = transition(cur, a);
          return r.ok ? r.next : cur;
        }, 'emergency');
        expect(end).toBe('emergency');
      }),
      RUNS,
    );
  });

  it('never throws for arbitrary values and is deterministic', () => {
    const weird = fc.oneof(
      fc.string(),
      fc.anything(),
      fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty', 'new:accept', ''),
      fc.constant(Symbol('x')),
    );
    fc.assert(
      fc.property(weird, weird, (s, a) => {
        const call = () => transition(s as unknown as JobStatus, a as unknown as JobAction);
        expect(call).not.toThrow();
        const r = call();
        expect(r.ok).toBe(false);
        expect(call()).toEqual(r);
      }),
      RUNS,
    );
  });

  it('is deterministic for valid pairs', () => {
    fc.assert(
      fc.property(pairArb, ([s, a]) => {
        expect(transition(s, a)).toEqual(transition(s, a));
      }),
      RUNS,
    );
  });
});
