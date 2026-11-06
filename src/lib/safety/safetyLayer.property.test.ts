import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkEmergency, applyOverrides } from './safetyLayer';
import type { BedrockInspectionResponse } from '@/types/bedrock';

// Filler that can never form or touch a trigger term (digits/punctuation only).
const fillerArb = (max: number) =>
  fc.string({ unit: fc.constantFrom('.', ' ', '-', '#'), minLength: 0, maxLength: max });

const pairs: Array<[string[], string[]]> = [
  [['spark', 'burning', 'scorch', 'smoke', 'melt'], ['outlet', 'socket', 'plug', 'panel', 'breaker', 'wire', 'wiring', 'switch', 'appliance', 'electrical']],
  [['water', 'flood', 'leak', 'wet'], ['outlet', 'socket', 'panel', 'breaker', 'wiring', 'electrical']],
  [['gas'], ['smell', 'odor', 'odour', 'leak', 'hiss']],
];
const singles = ['rotten egg', 'carbon monoxide', 'co alarm', 'co detector'];

const triggerTextArb = fc.oneof(
  fc.constantFrom(...singles).map((s) => s),
  fc
    .constantFrom(...pairs)
    .chain(([as, bs]) =>
      fc.record({
        a: fc.constantFrom(...as),
        b: fc.constantFrom(...bs),
        gap: fc.integer({ min: 1, max: 200 }).chain((n) => fillerArb(n).map((f) => f.padEnd(n, '.'))),
        reverse: fc.boolean(),
      }),
    )
    .map(({ a, b, gap, reverse }) => (reverse ? `${b}${gap}${a}` : `${a}${gap}${b}`)),
  // upper-case variants
).chain((t) => fc.constantFrom(t, t.toUpperCase()));

const edgeArb = fillerArb(40);

describe('Property 11', () => {
  // Feature: intake-and-triage, Property 11: Emergency detection on any trigger-containing text
  it('detects trigger text embedded at any position', () => {
    // **Validates: Requirements 6.1, 6.2**
    fc.assert(
      fc.property(triggerTextArb, edgeArb, edgeArb, fc.constantFrom('location', 'duration', 'recentChanges'), (t, pre, post, field) => {
        const contextAnswers = { location: '', duration: '', recentChanges: '', [field]: `${pre} ${t} ${post}` };
        expect(checkEmergency({ contextAnswers }).isEmergency).toBe(true);
        expect(
          checkEmergency({ contextAnswers: { location: '', duration: '', recentChanges: '' }, bedrockOutput: `${pre} ${t} ${post}` })
            .isEmergency,
        ).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('does not trigger on clean text', () => {
    // **Validates: Requirements 6.1, 6.2**
    fc.assert(
      fc.property(fillerArb(300), (s) => {
        expect(
          checkEmergency({ contextAnswers: { location: s, duration: s, recentChanges: s }, bedrockOutput: s }).isEmergency,
        ).toBe(false);
      }),
    );
  });
});

const bedrockArb: fc.Arbitrary<BedrockInspectionResponse> = fc
  .record({
    likelyIssue: fc.string(),
    trade: fc.string(),
    urgency: fc.constantFrom('urgent', 'soon', 'monitor') as fc.Arbitrary<'urgent' | 'soon' | 'monitor'>,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    costRangeLow: fc.integer({ min: 0, max: 1000 }),
    costRangeHigh: fc.integer({ min: 1000, max: 5000 }),
    jobBrief: fc.string(),
    followUpQuestions: fc.tuple(fc.string(), fc.string()),
    diySteps: fc.array(fc.string()),
  });

describe('Property 12', () => {
  // Feature: intake-and-triage, Property 12: Emergency urgency override is unconditional after Bedrock
  it('forces emergency urgency whatever Bedrock returned', () => {
    // **Validates: Requirements 6.3, 6.7**
    fc.assert(
      fc.property(bedrockArb, triggerTextArb, (b, t) => {
        const safety = checkEmergency({
          contextAnswers: { location: t, duration: '', recentChanges: '' },
          bedrockOutput: undefined,
        });
        expect(safety.isEmergency).toBe(true);
        const r = applyOverrides(b, safety, b.trade);
        expect(r.urgency).toBe('emergency');
        expect(r.isEmergency).toBe(true);
        expect(r.diySteps).toEqual([]);
        expect(r.jobBrief).toBe('');
        expect(r.costRangeLow).toBe(0);
        expect(r.costRangeHigh).toBe(0);
      }),
    );
  });
});

describe('Property 14', () => {
  // Feature: intake-and-triage, Property 14: DIY steps suppressed for dangerous trades
  it('empties diySteps for electric/gas/hvac/furnace trades', () => {
    // **Validates: Requirements 7.1**
    const casing = (s: string) =>
      fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }).map((flags) =>
        [...s].map((c, i) => (flags[i] ? c.toUpperCase() : c.toLowerCase())).join(''),
      );
    const tradeArb = fc
      .tuple(fc.constantFrom('electric', 'gas', 'hvac', 'furnace').chain(casing), fc.string(), fc.string())
      .map(([k, p, s]) => `${p}${k}${s}`);
    fc.assert(
      fc.property(bedrockArb, tradeArb, fc.boolean(), (b, trade, emergency) => {
        const r = applyOverrides(b, { isEmergency: emergency }, trade);
        expect(r.diySteps).toEqual([]);
      }),
    );
  });
});
