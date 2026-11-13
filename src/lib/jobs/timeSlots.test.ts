// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_SLOTS,
  SLOT_HORIZON_MS,
  SLOT_RULE_MESSAGES,
  canonicalizeSlots,
  isSlotExpired,
  isSlotOffered,
  slotsSchema,
  type SlotRule,
} from '@/lib/jobs/timeSlots';

const NOW = Date.UTC(2030, 0, 15, 12, 0, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;

function run(input: unknown) {
  return slotsSchema(NOW).safeParse(input);
}

function firstRule(input: unknown): SlotRule | undefined {
  const r = run(input);
  if (r.success) return undefined;
  return r.error.issues[0]?.message as SlotRule;
}

function allRules(input: unknown): string[] {
  const r = run(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe('constants', () => {
  it('exposes the limits', () => {
    expect(MAX_SLOTS).toBe(3);
    expect(SLOT_HORIZON_MS).toBe(30 * 24 * HOUR);
  });
});

describe('slot count', () => {
  it('rejects 0 slots with the count rule', () => {
    expect(firstRule([])).toBe('count');
    expect(SLOT_RULE_MESSAGES.count).toBe('Offer between 1 and 3 times.');
  });

  it('accepts 1 slot', () => {
    const r = run([iso(NOW + HOUR)]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([iso(NOW + HOUR)]);
  });

  it('accepts 3 slots', () => {
    const slots = [1, 2, 3].map((n) => iso(NOW + n * HOUR));
    const r = run(slots);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(3);
  });

  it('rejects 4 slots with the count rule', () => {
    const slots = [1, 2, 3, 4].map((n) => iso(NOW + n * HOUR));
    expect(firstRule(slots)).toBe('count');
  });

  it('rejects a non-array with the count rule', () => {
    expect(firstRule('2030-01-16T00:00:00.000Z')).toBe('count');
    expect(firstRule(undefined)).toBe('count');
  });
});

describe('duplicates', () => {
  it('rejects identical strings with the distinct rule', () => {
    const s = iso(NOW + HOUR);
    expect(firstRule([s, s])).toBe('distinct');
    expect(SLOT_RULE_MESSAGES.distinct).toBe('Each time must be different.');
  });

  it('rejects the same instant written with and without milliseconds', () => {
    expect(firstRule(['2030-01-16T10:00:00Z', '2030-01-16T10:00:00.000Z'])).toBe('distinct');
  });
});

describe('time window', () => {
  it('rejects a past slot with the past rule', () => {
    expect(firstRule([iso(NOW - HOUR)])).toBe('past');
    expect(SLOT_RULE_MESSAGES.past).toBe('Each time must be in the future.');
  });

  it('rejects exactly now', () => {
    expect(firstRule([iso(NOW)])).toBe('past');
  });

  it('accepts now + 1 ms', () => {
    expect(run([iso(NOW + 1)]).success).toBe(true);
  });

  it('accepts exactly now + 30 days', () => {
    expect(run([iso(NOW + SLOT_HORIZON_MS)]).success).toBe(true);
  });

  it('rejects now + 30 days + 1 ms with the horizon rule', () => {
    expect(firstRule([iso(NOW + SLOT_HORIZON_MS + 1)])).toBe('horizon');
    expect(SLOT_RULE_MESSAGES.horizon).toBe('Each time must be within the next 30 days.');
  });

  it('reports past before horizon when both occur', () => {
    expect(firstRule([iso(NOW - HOUR), iso(NOW + SLOT_HORIZON_MS + 1)])).toBe('past');
  });
});

describe('format', () => {
  it('rejects text that is not a date', () => {
    expect(firstRule(['tomorrow'])).toBe('format');
    expect(SLOT_RULE_MESSAGES.format).toBe('Each time must be a valid date and time.');
  });

  it('rejects an impossible date', () => {
    expect(firstRule(['2030-02-31T10:00:00Z'])).toBe('format');
  });

  it('rejects a time without the Z suffix', () => {
    expect(firstRule(['2030-01-16T10:00:00'])).toBe('format');
    expect(firstRule(['2030-01-16T10:00:00.000'])).toBe('format');
  });

  it('rejects an offset suffix', () => {
    expect(firstRule(['2030-01-16T10:00:00+02:00'])).toBe('format');
    expect(firstRule(['2030-01-16T10:00:00.000-05:00'])).toBe('format');
  });

  it('rejects a non-string element', () => {
    expect(firstRule([123])).toBe('format');
    expect(firstRule([null])).toBe('format');
    expect(firstRule([iso(NOW + HOUR), {}])).toBe('format');
  });

  it('accepts the form without milliseconds and canonicalises it', () => {
    const r = run(['2030-01-16T10:00:00Z']);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(['2030-01-16T10:00:00.000Z']);
  });
});

describe('invalid element together with more than 3 entries', () => {
  it('documents which rules are reported', () => {
    const input = [iso(NOW + HOUR), iso(NOW + 2 * HOUR), iso(NOW + 3 * HOUR), 'nope'];
    const rules = allRules(input);
    // Observed behaviour: only the array-level `count` issue is reported; the
    // element's `format` issue is not. The route takes the first issue, so it
    // answers with the count rule.
    expect(rules).toEqual(['count']);
    expect(firstRule(input)).toBe('count');
  });
});

describe('output', () => {
  it('is sorted ascending and canonical', () => {
    const a = iso(NOW + 3 * HOUR);
    const b = iso(NOW + HOUR);
    const c = iso(NOW + 2 * HOUR);
    const r = run([a, b, c]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([b, c, a]);
  });

  it('canonicalizeSlots sorts by instant and uses toISOString form', () => {
    expect(canonicalizeSlots(['2030-01-16T11:00:00Z', '2030-01-16T10:00:00.000Z'])).toEqual([
      '2030-01-16T10:00:00.000Z',
      '2030-01-16T11:00:00.000Z',
    ]);
  });

  it('is idempotent', () => {
    const once = canonicalizeSlots(['2030-01-16T11:00:00Z', '2030-01-16T10:00:00Z']);
    expect(canonicalizeSlots(once)).toEqual(once);
  });
});

describe('isSlotOffered', () => {
  const offered = ['2030-01-16T10:00:00.000Z', '2030-01-16T11:00:00.000Z'];

  it('matches an exact offered string', () => {
    expect(isSlotOffered(offered, '2030-01-16T10:00:00.000Z')).toBe(true);
  });

  it('does not match a non-canonical spelling of an offered instant', () => {
    expect(isSlotOffered(offered, '2030-01-16T10:00:00Z')).toBe(false);
    expect(isSlotOffered(offered, '2030-01-16T12:00:00.000+02:00')).toBe(false);
  });

  it('does not match an instant that was not offered, or an empty list', () => {
    expect(isSlotOffered(offered, '2030-01-16T12:00:00.000Z')).toBe(false);
    expect(isSlotOffered([], offered[0])).toBe(false);
  });
});

describe('isSlotExpired', () => {
  it('is expired at now', () => {
    expect(isSlotExpired(iso(NOW), NOW)).toBe(true);
  });

  it('is expired at now - 1 ms', () => {
    expect(isSlotExpired(iso(NOW - 1), NOW)).toBe(true);
  });

  it('is not expired at now + 1 ms', () => {
    expect(isSlotExpired(iso(NOW + 1), NOW)).toBe(false);
  });
});
