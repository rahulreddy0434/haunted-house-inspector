import { describe, it, expect } from 'vitest';
import { checkEmergency } from '@/lib/safety/safetyLayer';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { EXTRAS_OPTIONS, SOMETHING_ELSE } from '@/lib/intake/options';
import type { IntakeChoices } from '@/types/intake';

const EMPTY: IntakeChoices = {
  safety: [],
  location: null,
  placeText: '',
  duration: null,
  extras: [],
  somethingElseText: '',
};

describe('Safety_Wording', () => {
  it.each(SAFETY_CHIPS.map((c) => [c.id, c.wording] as const))(
    'the sentence for %s alone makes checkEmergency true',
    (_id, wording) => {
      expect(
        checkEmergency({ contextAnswers: { location: '', duration: '', recentChanges: wording } })
          .isEmergency,
      ).toBe(true);
    },
  );

  it('each sentence is a constant that contains no user input', () => {
    // Mapping a chip alone with hostile text in every free field must not change its sentence.
    for (const chip of SAFETY_CHIPS) {
      const plain = mapAnswers({ ...EMPTY, safety: [chip.id] });
      expect(plain.recentChanges).toBe(chip.wording);
      const withText = mapAnswers({
        ...EMPTY,
        safety: [chip.id],
        placeText: 'USER-PLACE',
        somethingElseText: 'USER-TEXT',
      });
      expect(withText.recentChanges).toBe(chip.wording);
      expect(chip.wording).not.toMatch(/USER-/);
    }
  });

  it('worst-case fixed recentChanges (4 sentences + 9 extras labels) is at most 498 characters', () => {
    const extras = EXTRAS_OPTIONS.filter((o) => o !== SOMETHING_ELSE);
    expect(extras).toHaveLength(9);
    const fixed = mapAnswers({
      ...EMPTY,
      safety: SAFETY_CHIPS.map((c) => c.id),
      extras: [...extras],
    }).recentChanges;
    for (const chip of SAFETY_CHIPS) expect(fixed).toContain(chip.wording);
    for (const label of extras) expect(fixed).toContain(label);
    expect(fixed.length).toBeLessThanOrEqual(498);
  });
});
