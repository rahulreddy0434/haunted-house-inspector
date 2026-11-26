import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { cleanFreeText, mapAnswers, somethingElseLimit, truncateUtf16 } from '@/lib/intake/answerMapper';
import { EXTRAS_OPTIONS, SOMETHING_ELSE } from '@/lib/intake/options';
import type { IntakeChoices } from '@/types/intake';

/** The text of the Step 3 review. The Live_Summary reads the same value. */
export interface ReviewText {
  /** Safety answer labels; empty means "None selected". */
  safety: string[];
  where: string;
  /** Empty means "Not given". */
  duration: string;
  /** Extras labels plus the cleaned Something_Else text; empty means "Nothing added". */
  extras: string[];
}

export const NO_SAFETY_TEXT = 'None selected';
export const NO_PHOTOS_TEXT = 'No photos';
export const NO_DURATION_TEXT = 'Not given';
export const NO_EXTRAS_TEXT = 'Nothing added';

export function reviewText(choices: IntakeChoices): ReviewText {
  const answers = mapAnswers(choices);
  const safety = SAFETY_CHIPS.filter((c) => choices.safety.includes(c.id)).map((c) => c.label);

  const extras: string[] = EXTRAS_OPTIONS.filter(
    (o) => o !== SOMETHING_ELSE && choices.extras.includes(o),
  );
  if (choices.extras.includes(SOMETHING_ELSE)) {
    const free = truncateUtf16(
      cleanFreeText(choices.somethingElseText),
      somethingElseLimit(choices),
    );
    if (free) extras.push(free);
  }

  return { safety, where: answers.location, duration: answers.duration, extras };
}
