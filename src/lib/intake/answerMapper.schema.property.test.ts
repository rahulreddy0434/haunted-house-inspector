import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { LOCATION_OPTIONS } from '@/lib/intake/options';
import { arbIntakeChoices } from '@/lib/intake/testArbitraries';
import { contextAnswersSchema } from '@/lib/validation/inspectionSchema';

describe('answerMapper schema compatibility', () => {
  // Feature: guided-intake, Property 5: Mapped answers pass the existing request schema
  /**
   * **Validates: Requirements 7.8, 13.3**
   */
  it('mapAnswers output passes contextAnswersSchema.safeParse when a location is chosen', () => {
    const arbWithLocation = arbIntakeChoices.map((choices) => ({
      ...choices,
      location: choices.location ?? LOCATION_OPTIONS[0],
    }));

    fc.assert(
      fc.property(arbWithLocation, (choices) => {
        const answers = mapAnswers(choices);
        const result = contextAnswersSchema.safeParse(answers);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.location).toBe(answers.location.trim());
          expect(result.data.duration).toBe(answers.duration);
          expect(result.data.recentChanges).toBe(answers.recentChanges);
        }
      }),
      { numRuns: 200 },
    );
  });
});
