import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { bedrockResponseSchema } from '@/lib/validation/inspectionSchema';

const isStr = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && !Number.isNaN(v) && v >= min && v <= max;

/** Independent oracle: does the value satisfy every schema constraint? */
function meetsConstraints(o: unknown): boolean {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  const q = r.followUpQuestions;
  return (
    isStr(r.likelyIssue, 500) &&
    isStr(r.trade, 100) &&
    (r.urgency === 'urgent' || r.urgency === 'soon' || r.urgency === 'monitor') &&
    isNum(r.confidence, 0, 1) &&
    isNum(r.costRangeLow, 0, 999999) &&
    isNum(r.costRangeHigh, 0, 999999) &&
    (r.costRangeHigh as number) >= (r.costRangeLow as number) &&
    isStr(r.jobBrief, 1000) &&
    Array.isArray(q) &&
    q.length === 2 &&
    isStr(q[0], 200) &&
    isStr(q[1], 200) &&
    Array.isArray(r.diySteps) &&
    r.diySteps.every((s) => typeof s === 'string')
  );
}

// Fields drawn from a mix of in-range, out-of-range, and wrong-typed values.
const str = (max: number) =>
  fc.oneof(
    fc.string({ maxLength: max }),
    fc.string({ minLength: max + 1, maxLength: max + 20 }),
    fc.constant(undefined),
    fc.integer(),
  );
const num = (min: number, max: number) =>
  fc.oneof(
    fc.double({ min, max, noNaN: true }),
    fc.double({ noNaN: false }),
    fc.integer({ min: min - 5, max: max + 5 }),
    fc.constant('5'),
    fc.constant(undefined),
  );

const structured = fc.record(
  {
    likelyIssue: str(500),
    trade: str(100),
    urgency: fc.oneof(
      fc.constantFrom('urgent', 'soon', 'monitor'),
      fc.string(),
      fc.constant(undefined),
    ),
    confidence: num(0, 1),
    costRangeLow: num(0, 999999),
    costRangeHigh: num(0, 999999),
    jobBrief: str(1000),
    followUpQuestions: fc.oneof(
      fc.tuple(str(200), str(200)),
      fc.array(fc.string({ maxLength: 200 }), { maxLength: 4 }),
      fc.constant(undefined),
    ),
    diySteps: fc.oneof(
      fc.array(fc.string(), { maxLength: 5 }),
      fc.array(fc.oneof(fc.string(), fc.integer()), { maxLength: 5 }),
      fc.constant(undefined),
    ),
  },
  { requiredKeys: [] },
);

// Mostly-valid objects so the success branch is exercised often.
const mostlyValid = fc
  .record({
    likelyIssue: fc.string({ maxLength: 500 }),
    trade: fc.string({ maxLength: 100 }),
    urgency: fc.constantFrom('urgent', 'soon', 'monitor'),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    costRangeLow: fc.double({ min: 0, max: 999999, noNaN: true }),
    costRangeHigh: fc.double({ min: 0, max: 999999, noNaN: true }),
    jobBrief: fc.string({ maxLength: 1000 }),
    followUpQuestions: fc.tuple(
      fc.string({ maxLength: 200 }),
      fc.string({ maxLength: 200 }),
    ),
    diySteps: fc.array(fc.string(), { maxLength: 5 }),
  })
  .map((o) => (o.costRangeHigh >= o.costRangeLow ? o : { ...o, costRangeLow: o.costRangeHigh, costRangeHigh: o.costRangeLow }));

describe('bedrockResponseSchema', () => {
  // Feature: intake-and-triage, Property 19: Zod schema correctly classifies Bedrock responses
  // **Validates: Requirements 8.3, 8.4**
  it('Property 19: safeParse succeeds iff all constraints are met', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.object(), structured, mostlyValid),
        (input) => {
          expect(bedrockResponseSchema.safeParse(input).success).toBe(meetsConstraints(input));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('accepts a known-valid response and rejects high < low', () => {
    const valid = {
      likelyIssue: 'Leaky pipe',
      trade: 'plumber',
      urgency: 'soon',
      confidence: 0.7,
      costRangeLow: 100,
      costRangeHigh: 300,
      jobBrief: 'Brief',
      followUpQuestions: ['a?', 'b?'],
      diySteps: [],
    };
    expect(bedrockResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      bedrockResponseSchema.safeParse({ ...valid, costRangeLow: 500, costRangeHigh: 100 }).success,
    ).toBe(false);
  });
});
