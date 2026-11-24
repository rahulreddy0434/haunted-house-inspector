import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { arbIntakeChoices } from '@/lib/intake/testArbitraries';
import { SOMETHING_ELSE } from '@/lib/intake/options';
import type { IntakeChoices } from '@/types/intake';

// Feature: guided-intake, Property 2: Safety_Wording leads `recentChanges` verbatim, and appears only when chosen

const NUM_RUNS = 200;

function expectedLead(choices: IntakeChoices): string {
  return SAFETY_CHIPS.filter((c) => choices.safety.includes(c.id))
    .map((c) => c.wording)
    .join(' ');
}

function answerStrings(choices: IntakeChoices): string[] {
  const a = mapAnswers(choices);
  return [a.location, a.duration, a.recentChanges];
}

describe('Property 2: Safety_Wording placement', () => {
  /**
   * **Validates: Requirements 1.1, 1.6, 1.7**
   */
  it('recentChanges starts with the selected Safety_Wording sentences, in order, joined by single spaces', () => {
    fc.assert(
      fc.property(arbIntakeChoices, (choices) => {
        const lead = expectedLead(choices);
        const { recentChanges } = mapAnswers(choices);
        expect(recentChanges.startsWith(lead)).toBe(true);
        if (lead !== '' && recentChanges.length > lead.length) {
          expect(recentChanges[lead.length]).toBe(' ');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.6, 1.7**
   */
  it('keeps the Safety_Wording first with 2,000-character Free_Text in both boxes', () => {
    fc.assert(
      fc.property(
        arbIntakeChoices,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''),
        (base, unit) => {
          const long = unit.repeat(Math.ceil(2000 / unit.length)).slice(0, 2000);
          const choices: IntakeChoices = {
            ...base,
            placeText: long,
            somethingElseText: long,
            extras: base.extras.includes(SOMETHING_ELSE)
              ? base.extras
              : [...base.extras, SOMETHING_ELSE],
          };
          const lead = expectedLead(choices);
          const { recentChanges } = mapAnswers(choices);
          expect(recentChanges.startsWith(lead)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.6, 1.7**
   */
  it('with no Safety_Chip selected, no Answer_String contains any Safety_Wording', () => {
    fc.assert(
      fc.property(arbIntakeChoices, (base) => {
        const choices: IntakeChoices = { ...base, safety: [] };
        for (const text of answerStrings(choices)) {
          for (const chip of SAFETY_CHIPS) {
            expect(text.includes(chip.wording)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.6, 1.7**
   */
  it('a Safety_Wording appears in recentChanges only for chosen chips', () => {
    fc.assert(
      fc.property(arbIntakeChoices, (choices) => {
        const { recentChanges } = mapAnswers(choices);
        for (const chip of SAFETY_CHIPS) {
          if (!choices.safety.includes(chip.id)) {
            expect(recentChanges.includes(chip.wording)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
