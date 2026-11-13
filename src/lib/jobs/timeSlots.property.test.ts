// @vitest-environment node
// Feature: pro-dashboard-and-booking, Property 9: Time_Slot validation
// **Validates: Requirements 7.2, 7.3, 7.4, 10.3, 10.4, 16.10**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  SLOT_HORIZON_MS,
  canonicalizeSlots,
  isSlotExpired,
  isSlotOffered,
  slotsSchema,
  type SlotRule,
} from '@/lib/jobs/timeSlots';

const DAY = 24 * 60 * 60 * 1000;
const NOW_MS = Date.parse('2030-06-15T12:00:00.000Z');
const RULES: readonly SlotRule[] = ['count', 'format', 'distinct', 'past', 'horizon'];

const instantArb = fc.integer({ min: NOW_MS - 2 * DAY, max: NOW_MS + 40 * DAY });
const canonicalArb = instantArb.map((t) => new Date(t).toISOString());

// Offset-suffixed or Z-less mutations of a canonical string.
const mutatedArb = fc
  .tuple(
    canonicalArb,
    fc.constantFrom('+02:00', '-05:30', '+00:00', '', ' ', 'z'),
  )
  .map(([s, suffix]) => s.replace('Z', suffix));

const slotArb = fc.oneof(
  { weight: 6, arbitrary: canonicalArb },
  { weight: 2, arbitrary: mutatedArb },
  { weight: 1, arbitrary: fc.string() },
);

// Lists of 0 to 4 entries, sometimes with a duplicated entry.
const listArb = fc.oneof(
  { weight: 4, arbitrary: fc.array(slotArb, { maxLength: 4 }) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.array(canonicalArb, { minLength: 1, maxLength: 3 }), fc.nat())
      .map(([l, i]) => [...l, l[i % l.length]].slice(0, 4)),
  },
);

const FORMAT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Independent reference: the rule violated first, in order count, format, distinct, past, horizon. */
function oracle(list: string[], nowMs: number): SlotRule | null {
  if (list.length < 1 || list.length > 3) return 'count';
  if (list.some((s) => !FORMAT_RE.test(s) || Number.isNaN(Date.parse(s)))) return 'format';
  const t = list.map((s) => Date.parse(s));
  if (new Set(t).size !== t.length) return 'distinct';
  if (t.some((x) => x <= nowMs)) return 'past';
  if (t.some((x) => x > nowMs + SLOT_HORIZON_MS)) return 'horizon';
  return null;
}

describe('Property 9: Time_Slot validation', () => {
  it('accepts exactly what the oracle accepts, and reports the violated rule otherwise', () => {
    fc.assert(
      fc.property(listArb, (list) => {
        const expected = oracle(list, NOW_MS);
        const result = slotsSchema(NOW_MS).safeParse(list);
        if (expected === null) {
          expect(result.success).toBe(true);
          if (!result.success) return;
          const out = result.data;
          const times = out.map((s) => Date.parse(s));
          expect(out).toHaveLength(list.length);
          expect([...times].sort((a, b) => a - b)).toEqual(times);
          expect(out.every((s) => s === new Date(s).toISOString())).toBe(true);
          expect(canonicalizeSlots(out)).toEqual(out);
          expect(new Set(out)).toEqual(new Set(list.map((s) => new Date(s).toISOString())));
        } else {
          expect(result.success).toBe(false);
          if (result.success) return;
          // The route maps the FIRST issue; later issues may follow (the superRefine
          // also runs after an element format failure), but every issue is a rule key.
          const keys = result.error.issues.map((i) => i.message);
          for (const k of keys) expect(RULES).toContain(k);
          expect(keys[0]).toBe(expected);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('rejects offset-suffixed and Z-less mutations as format', () => {
    fc.assert(
      fc.property(
        canonicalArb,
        fc.constantFrom('+02:00', '-05:30', '+00:00', ''),
        (s, suffix) => {
          const result = slotsSchema(NOW_MS).safeParse([s.replace('Z', suffix)]);
          expect(result.success).toBe(false);
          if (!result.success) expect(result.error.issues[0].message).toBe('format');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applies the explicit boundaries', () => {
    const check = (t: number) => slotsSchema(NOW_MS).safeParse([new Date(t).toISOString()]);
    const past = check(NOW_MS);
    expect(past.success).toBe(false);
    if (!past.success) expect(past.error.issues[0].message).toBe('past');
    expect(check(NOW_MS + 1).success).toBe(true);
    expect(check(NOW_MS + SLOT_HORIZON_MS).success).toBe(true);
    const far = check(NOW_MS + SLOT_HORIZON_MS + 1);
    expect(far.success).toBe(false);
    if (!far.success) expect(far.error.issues[0].message).toBe('horizon');
  });

  it('isSlotOffered is exact string equality', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 3 }), fc.string(), (offered, slot) => {
        expect(isSlotOffered(offered, slot)).toBe(offered.some((o) => o === slot));
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(canonicalArb, (s) => {
        expect(isSlotOffered([s], s)).toBe(true);
        expect(isSlotOffered([s], s.replace('Z', '+00:00'))).toBe(false);
        expect(isSlotOffered([s], `${s} `)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isSlotExpired is true exactly when the instant is not later than now', () => {
    fc.assert(
      fc.property(instantArb, (t) => {
        expect(isSlotExpired(new Date(t).toISOString(), NOW_MS)).toBe(t <= NOW_MS);
      }),
      { numRuns: 100 },
    );
    expect(isSlotExpired(new Date(NOW_MS).toISOString(), NOW_MS)).toBe(true);
    expect(isSlotExpired(new Date(NOW_MS + 1).toISOString(), NOW_MS)).toBe(false);
  });
});
