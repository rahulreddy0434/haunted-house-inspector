import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkEmergency, applyOverrides } from './safetyLayer';
import type { EmergencyConditionCode } from './safetyLayer';
import type { BedrockInspectionResponse } from '@/types/bedrock';
import type { ContextAnswers } from '@/types/inspection';

type Field = keyof ContextAnswers;

// Padding of spaces/punctuation only: never forms or glues onto a trigger word.
const padArb = fc.string({ unit: fc.constantFrom(' ', '.', ',', '-', '!'), minLength: 0, maxLength: 30 });

const casing = (t: string) => fc.constantFrom(t, t.toUpperCase());

const triggersByCode: Record<EmergencyConditionCode, string[]> = {
  GAS_SMELL: ['rotten egg', 'gas leak', 'smell gas'],
  CO_ALARM: ['carbon monoxide', 'co alarm', 'co detector'],
  ELECTRICAL_FIRE: ['spark near the outlet', 'sparks at outlet'],
  WATER_ELECTRICAL: ['water near the panel', 'water by panel'],
};

const codeArb = fc.constantFrom<EmergencyConditionCode>('GAS_SMELL', 'CO_ALARM', 'ELECTRICAL_FIRE', 'WATER_ELECTRICAL');
const fieldArb = fc.constantFrom<Field>('location', 'duration', 'recentChanges');

const triggerArb = codeArb.chain((code) => fc.constantFrom(...triggersByCode[code]).chain(casing));

// Clean vocabulary: no trigger terms, no whole-word 'gas'/'co'.
const SAFE_WORDS = ['kitchen', 'upstairs', 'cellar', 'weeks', 'tuesday', 'ceiling', 'crack', 'door', 'paint', 'garden', 'stairs', 'window'];
const cleanTextArb = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 0, maxLength: 8 })
  .map((w) => w.join(' '));

const answersWithArb = (textArb: fc.Arbitrary<string>) =>
  fc
    .tuple(fieldArb, textArb, cleanTextArb, cleanTextArb, cleanTextArb)
    .map(([field, text, a, b, c]): ContextAnswers => {
      const base: ContextAnswers = { location: a, duration: b, recentChanges: c };
      return { ...base, [field]: text };
    });

const triggerAnswersArb = fc
  .tuple(triggerArb, padArb, padArb)
  .chain(([t, pre, post]) => answersWithArb(fc.constant(`${pre} ${t} ${post}`)));

const bedrockArb: fc.Arbitrary<BedrockInspectionResponse> = fc.record({
  likelyIssue: cleanTextArb,
  trade: cleanTextArb,
  urgency: fc.constantFrom<'urgent' | 'soon' | 'monitor'>('urgent', 'soon', 'monitor'),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  costRangeLow: fc.integer({ min: 0, max: 1000 }),
  costRangeHigh: fc.integer({ min: 1000, max: 5000 }),
  jobBrief: cleanTextArb,
  followUpQuestions: fc.tuple(cleanTextArb, cleanTextArb),
  diySteps: fc.array(cleanTextArb, { maxLength: 4 }),
});

const validBedrockStringArb = bedrockArb.map((b) => JSON.stringify(b));

const garbageArb = fc.oneof(
  fc.string({ unit: fc.constantFrom('{', '}', '[', ']', '"', ':', ',', '1', '#', ' ', 'x') }),
  validBedrockStringArb.chain((s) => fc.integer({ min: 0, max: s.length - 1 }).map((n) => s.slice(0, n))),
);

describe('Property 21', () => {
  // Feature: intake-and-triage, Property 21: Safety trigger in context answers produces emergency regardless of Bedrock outcome
  it('flags emergency when Bedrock output is missing, valid, or malformed', () => {
    // **Validates: Requirements 6.1, 6.3, 6.8, 6.9**
    fc.assert(
      fc.property(triggerAnswersArb, validBedrockStringArb, garbageArb, (contextAnswers, valid, garbage) => {
        expect(checkEmergency({ contextAnswers, bedrockOutput: undefined }).isEmergency).toBe(true);
        expect(checkEmergency({ contextAnswers, bedrockOutput: valid }).isEmergency).toBe(true);
        expect(checkEmergency({ contextAnswers, bedrockOutput: garbage }).isEmergency).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('reports the matching condition for each trigger code in every field', () => {
    // **Validates: Requirements 6.1, 6.3, 6.8, 6.9**
    fc.assert(
      fc.property(codeArb, fieldArb, padArb, padArb, (code, field, pre, post) => {
        for (const phrase of triggersByCode[code]) {
          const contextAnswers: ContextAnswers = { location: '', duration: '', recentChanges: '', [field]: `${pre} ${phrase} ${post}` };
          const r = checkEmergency({ contextAnswers, bedrockOutput: '{"truncated":' });
          expect(r.isEmergency).toBe(true);
          expect(r.triggeredCondition).toBe(code);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('applyOverrides yields the emergency shape for any valid Bedrock response', () => {
    // **Validates: Requirements 6.1, 6.3, 6.8, 6.9**
    fc.assert(
      fc.property(triggerAnswersArb, bedrockArb, (contextAnswers, b) => {
        const safety = checkEmergency({ contextAnswers });
        expect(safety.isEmergency).toBe(true);
        const r = applyOverrides(b, safety, b.trade, { answers: contextAnswers });
        expect(r.urgency).toBe('emergency');
        expect(r.isEmergency).toBe(true);
        expect(r.costRangeLow).toBe(0);
        expect(r.costRangeHigh).toBe(0);
        expect(r.jobBrief).toBe('');
        expect(r.diySteps).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('negative control: clean answers with garbage Bedrock output are not emergencies', () => {
    // **Validates: Requirements 6.1, 6.3, 6.8, 6.9**
    const cleanGarbageArb = fc.oneof(
      fc.string({ unit: fc.constantFrom('{', '}', '[', ']', '"', ':', ',', '1', '#', ' ') }),
      fc.array(fc.constantFrom(...SAFE_WORDS), { maxLength: 6 }).map((w) => `{"likelyIssue":"${w.join(' ')}`),
    );
    fc.assert(
      fc.property(answersWithArb(cleanTextArb), cleanGarbageArb, (contextAnswers, garbage) => {
        expect(checkEmergency({ contextAnswers, bedrockOutput: garbage }).isEmergency).toBe(false);
        expect(checkEmergency({ contextAnswers }).isEmergency).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
