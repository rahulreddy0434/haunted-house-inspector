import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkEmergency } from '@/lib/safety/safetyLayer';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { arbIntakeChoices } from '@/lib/intake/testArbitraries';

describe('Safety_Chips and the Safety_Layer', () => {
  // Feature: guided-intake, Property 1: any Safety_Chip makes the server-side check return an emergency
  /**
   * **Validates: Requirements 1.2, 13.1**
   */
  it('any non-empty subset of Safety_Chips yields an emergency from the real checkEmergency', () => {
    fc.assert(
      fc.property(
        arbIntakeChoices,
        fc.subarray(
          SAFETY_CHIPS.map((c) => c.id),
          { minLength: 1 },
        ),
        (choices, safety) => {
          const answers = mapAnswers({ ...choices, safety });
          const result = checkEmergency({ contextAnswers: answers });
          expect(result.isEmergency).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('each single Safety_Chip alone is an emergency', () => {
    for (const chip of SAFETY_CHIPS) {
      const answers = mapAnswers({
        safety: [chip.id],
        location: null,
        placeText: '',
        duration: null,
        extras: [],
        somethingElseText: '',
      });
      expect(checkEmergency({ contextAnswers: answers }).isEmergency).toBe(true);
    }
  });
});
