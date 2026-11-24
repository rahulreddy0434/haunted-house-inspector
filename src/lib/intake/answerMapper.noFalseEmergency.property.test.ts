import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { DURATION_OPTIONS, EXTRAS_OPTIONS, LOCATION_OPTIONS } from '@/lib/intake/options';
import { checkEmergency } from '@/lib/safety/safetyLayer';
import type { IntakeChoices } from '@/types/intake';

const NO_TEXT: Pick<IntakeChoices, 'safety' | 'placeText' | 'somethingElseText'> = {
  safety: [],
  placeText: '',
  somethingElseText: '',
};

function isEmergency(choices: IntakeChoices): boolean {
  return checkEmergency({ contextAnswers: mapAnswers(choices) }).isEmergency;
}

// Feature: guided-intake, Property 3: Chip labels alone never trigger an emergency
describe('Property 3: chip labels alone never trigger an emergency', () => {
  /**
   * **Validates: Requirements 7.11**
   */
  it('no Safety_Chip and empty Free_Text never gives an emergency (random chips)', () => {
    const arbChipOnly: fc.Arbitrary<IntakeChoices> = fc.record({
      safety: fc.constant([] as const),
      location: fc.option(fc.constantFrom(...LOCATION_OPTIONS), { nil: null }),
      placeText: fc.constant(''),
      duration: fc.option(fc.constantFrom(...DURATION_OPTIONS), { nil: null }),
      extras: fc.subarray([...EXTRAS_OPTIONS]),
      somethingElseText: fc.constant(''),
    });
    fc.assert(
      fc.property(arbChipOnly, (choices) => {
        expect(isEmergency(choices)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 7.11**
   */
  it('every single label on its own is not an emergency', () => {
    const base: IntakeChoices = { ...NO_TEXT, location: null, duration: null, extras: [] };
    for (const location of LOCATION_OPTIONS) {
      expect(isEmergency({ ...base, location }), `location: ${location}`).toBe(false);
    }
    for (const duration of DURATION_OPTIONS) {
      expect(isEmergency({ ...base, duration }), `duration: ${duration}`).toBe(false);
    }
    for (const extra of EXTRAS_OPTIONS) {
      expect(isEmergency({ ...base, extras: [extra] }), `extra: ${extra}`).toBe(false);
    }
  });

  /**
   * **Validates: Requirements 7.11**
   */
  it('every pair of Extras is not an emergency', () => {
    const base: IntakeChoices = { ...NO_TEXT, location: null, duration: null, extras: [] };
    for (let i = 0; i < EXTRAS_OPTIONS.length; i += 1) {
      for (let j = i + 1; j < EXTRAS_OPTIONS.length; j += 1) {
        const extras = [EXTRAS_OPTIONS[i], EXTRAS_OPTIONS[j]];
        expect(isEmergency({ ...base, extras }), extras.join(' + ')).toBe(false);
      }
    }
  });
});
