import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('server-only', () => ({}));

import { replyTriggersEmergency } from '@/lib/safety/replyCheck';
import { emergencyRuleFor } from './ruleWrapper';

// Feature: screens-polish, Property 10: The Emergency_Rule_Wrapper agrees with replyTriggersEmergency
// **Validates: Requirements 18.4, 18.5**

const RULE_CODES = ['GAS_SMELL', 'ELECTRICAL_FIRE', 'WATER_ELECTRICAL', 'CO_ALARM'];

// Trigger phrases from the existing corpus in src/lib/safety/replyCheck.test.ts.
const TRIGGER_PHRASES = [
  'I can smell gas in the kitchen',
  'It smells like rotten eggs',
  'There were sparks coming from the outlet',
  'a burning smell near the panel and scorch marks',
  'Water is flooding near the electrical panel',
  'The carbon monoxide alarm is going off',
  'our CO alarm beeped',
  'GAS SMELL EVERYWHERE',
];

const padded = fc
  .tuple(fc.string({ maxLength: 40 }), fc.constantFrom(...TRIGGER_PHRASES), fc.string({ maxLength: 40 }))
  .map(([a, p, b]) => `${a} ${p} ${b}`);

const anyText = fc.oneof(fc.string({ maxLength: 120 }), padded);

describe('Property 10: emergencyRuleFor agrees with replyTriggersEmergency', () => {
  it('isEmergency matches, rule is one of the four codes when true, undefined when false', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const out = emergencyRuleFor(text);
        expect(out.isEmergency).toBe(replyTriggersEmergency(text));
        if (out.isEmergency) {
          expect(RULE_CODES).toContain(out.rule);
        } else {
          expect(out.rule).toBeUndefined();
        }
      }),
      { numRuns: 200 },
    );
  });

  it('padded corpus phrases are mostly detected (sanity: the true branch is exercised)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TRIGGER_PHRASES), (p) => {
        expect(emergencyRuleFor(p).isEmergency).toBe(true);
      }),
    );
  });
});
