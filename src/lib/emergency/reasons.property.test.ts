// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EMERGENCY_REASON_SENTENCES, emergencyReasonSentence } from '@/lib/emergency/reasons';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';
import { toHomeownerStatusView, toProEmergencyDetail } from '@/lib/jobs/views';
import { makeJobItem } from '@/test/jobFixtures';
import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';

const EXPECTED: Record<EmergencyConditionCode, string> = {
  GAS_SMELL: 'This may be a gas leak.',
  ELECTRICAL_FIRE: 'This may be an electrical fire risk.',
  WATER_ELECTRICAL: 'Water near electricity can cause shocks or a fire.',
  CO_ALARM: 'A carbon monoxide alarm means the air may be unsafe to breathe.',
};
const CODES = Object.keys(EXPECTED) as EmergencyConditionCode[];

// Feature: screens-polish, Property 9: The reason-sentence mapping is total and exact
// **Validates: Requirements 18.7, 18.8, 18.9, 18.10**
describe('Property 9: The reason-sentence mapping is total and exact', () => {
  it('returns the exact fixed sentence for each of the four codes', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CODES), (code) => {
        expect(emergencyReasonSentence(code)).toBe(EXPECTED[code]);
      }),
    );
  });

  it('returns undefined for undefined and any non-code string, never throwing', () => {
    const special = ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf', ''];
    const other = fc.oneof(fc.string(), fc.constantFrom(...special)).filter((s) => !CODES.includes(s as EmergencyConditionCode));
    fc.assert(
      fc.property(other, (s) => {
        expect(emergencyReasonSentence(s)).toBeUndefined();
      }),
    );
    expect(emergencyReasonSentence(undefined)).toBeUndefined();
  });

  it('has four distinct sentences, none equal to or containing EMERGENCY_MESSAGE', () => {
    const sentences = CODES.map((c) => emergencyReasonSentence(c) as string);
    expect(new Set(sentences).size).toBe(4);
    expect(Object.keys(EMERGENCY_REASON_SENTENCES).sort()).toEqual([...CODES].sort());
    for (const s of sentences) {
      expect(s).not.toBe(EMERGENCY_MESSAGE);
      expect(s).not.toContain(EMERGENCY_MESSAGE);
    }
    expect(EMERGENCY_MESSAGE).toBe(
      'This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.',
    );
  });

  it('views include the sentence for a job with a rule and omit the key without one', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CODES), (code) => {
        const withRule = makeJobItem('emergency', { emergencyRule: code });
        const home = toHomeownerStatusView(withRule);
        expect(home).toMatchObject({ status: 'emergency', message: EMERGENCY_MESSAGE, reasonSentence: EXPECTED[code] });
        expect(toProEmergencyDetail(withRule).reasonSentence).toBe(EXPECTED[code]);

        const without = makeJobItem('emergency');
        const homeNo = toHomeownerStatusView(without);
        expect(homeNo).toMatchObject({ status: 'emergency', message: EMERGENCY_MESSAGE });
        expect('reasonSentence' in homeNo).toBe(false);
        expect('reasonSentence' in toProEmergencyDetail(without)).toBe(false);
      }),
    );
  });

  it('omits the key when the saved rule is not a known code', () => {
    fc.assert(
      fc.property(fc.string().filter((s) => !CODES.includes(s as EmergencyConditionCode)), (rule) => {
        const job = makeJobItem('emergency', { emergencyRule: rule as EmergencyConditionCode });
        expect('reasonSentence' in toHomeownerStatusView(job)).toBe(false);
        expect('reasonSentence' in toProEmergencyDetail(job)).toBe(false);
      }),
    );
  });
});
