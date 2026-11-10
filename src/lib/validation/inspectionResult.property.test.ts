import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { inspectionResultSchema } from '@/lib/validation/inspectionSchema';
import type { InspectionResult } from '@/types/inspection';

// Feature: intake-and-triage, Property 18: InspectionResult serialisation round-trip
// **Validates: Requirements 13.3**

// Well-formed unicode strings (no lone surrogates). maxLength counts code points,
// so halve the limit to keep the UTF-16 length within the schema's max.
const text = (maxUtf16: number) =>
  fc.fullUnicodeString({ maxLength: Math.floor(maxUtf16 / 2) });

// JSON turns -0 into 0, so never generate -0.
const noNegZero = (n: number) => (Object.is(n, -0) ? 0 : n);

const costPairArb = fc
  .tuple(
    fc.oneof(
      fc.integer({ min: 0, max: 999999 }),
      fc.double({ min: 0, max: 999999, noNaN: true }).map(noNegZero),
    ),
    fc.oneof(
      fc.integer({ min: 0, max: 999999 }),
      fc.double({ min: 0, max: 999999, noNaN: true }).map(noNegZero),
    ),
  )
  .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [number, number]);

const baseArb = fc.record({
  id: fc.uuid(),
  createdAt: fc
    .date({
      min: new Date('2020-01-01'),
      max: new Date('2100-01-01'),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  s3Keys: fc.array(
    fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,59}$/),
    { minLength: 1, maxLength: 5 },
  ),
  likelyIssue: text(500),
  trade: text(100),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }).map(noNegZero),
  followUpQuestions: fc.tuple(text(200), text(200)),
  answers: fc.record({
    location: text(500),
    duration: text(500),
    recentChanges: text(500),
  }),
});

const normalArb: fc.Arbitrary<InspectionResult> = fc
  .tuple(
    baseArb,
    fc.constantFrom('urgent', 'soon', 'monitor' as const),
    costPairArb,
    text(1000),
    fc.array(text(200), { maxLength: 6 }),
  )
  .map(([base, urgency, [low, high], jobBrief, diySteps]) => ({
    ...base,
    urgency: urgency as InspectionResult['urgency'],
    isEmergency: false,
    costRangeLow: low,
    costRangeHigh: high,
    jobBrief,
    diySteps,
  }));

const emergencyArb: fc.Arbitrary<InspectionResult> = baseArb.map((base) => ({
  ...base,
  urgency: 'emergency' as const,
  isEmergency: true,
  costRangeLow: 0,
  costRangeHigh: 0,
  jobBrief: '',
  diySteps: [],
}));

const ValidInspectionResultArb = fc.oneof(normalArb, emergencyArb);

const roundTrip = (x: InspectionResult) =>
  inspectionResultSchema.parse(JSON.parse(JSON.stringify(x)));

describe('Property 18: InspectionResult serialisation round-trip', () => {
  it('round-trips any valid InspectionResult through JSON and the schema', () => {
    fc.assert(
      fc.property(ValidInspectionResultArb, (x) => {
        expect(roundTrip(x)).toStrictEqual(x);
      }),
      { numRuns: 200 },
    );
  });

  it('round-trips the emergency shape', () => {
    fc.assert(
      fc.property(emergencyArb, (x) => {
        const out = roundTrip(x);
        expect(out).toStrictEqual(x);
        expect(out.urgency).toBe('emergency');
        expect(out.isEmergency).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
