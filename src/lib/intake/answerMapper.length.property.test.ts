import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { EXTRAS_OPTIONS, SOMETHING_ELSE } from '@/lib/intake/options';
import { arbIntakeChoices } from '@/lib/intake/testArbitraries';
import { MAX_ANSWER_LENGTH } from '@/lib/utils/contextAnswers';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Own reference for the fixed (non Free_Text) start of recentChanges. */
function expectedFixedPrefix(safety: readonly string[], extras: readonly string[]): string {
  const wording = SAFETY_CHIPS.filter((c) => safety.includes(c.id)).map((c) => c.wording);
  const labels = EXTRAS_OPTIONS.filter((o) => o !== SOMETHING_ELSE && extras.includes(o)).map((o) =>
    /[.!?]$/.test(o) ? o : `${o}.`,
  );
  return [...wording, ...labels].join(' ');
}

describe('answerMapper length', () => {
  // Feature: guided-intake, Property 4: Answer strings never exceed 500 characters, and only free text is shortened
  // **Validates: Requirements 7.6, 7.7, 7.9, 13.3**
  it('keeps every answer within the limit, keeps fixed parts whole and is deterministic', () => {
    fc.assert(
      fc.property(arbIntakeChoices, (choices) => {
        const out = mapAnswers(choices);

        // 7.7: length limit
        for (const value of [out.location, out.duration, out.recentChanges]) {
          expect(value.length).toBeLessThanOrEqual(MAX_ANSWER_LENGTH);
        }

        // 7.6: truncation never splits a code point
        for (const value of [out.location, out.duration, out.recentChanges]) {
          expect(LONE_SURROGATE.test(value)).toBe(false);
        }

        // 7.6: fixed parts stay complete
        if (choices.location) expect(out.location.startsWith(choices.location)).toBe(true);
        expect(out.duration).toBe(choices.duration ?? '');
        const prefix = expectedFixedPrefix(choices.safety, choices.extras);
        expect(out.recentChanges.startsWith(prefix)).toBe(true);
        for (const chip of SAFETY_CHIPS) {
          if (choices.safety.includes(chip.id)) {
            expect(out.recentChanges).toContain(chip.wording);
          }
        }

        // 7.9: same input, same output
        expect(mapAnswers(choices)).toEqual(out);
        expect(mapAnswers(structuredClone(choices))).toEqual(out);
      }),
      { numRuns: 200 },
    );
  });
});
