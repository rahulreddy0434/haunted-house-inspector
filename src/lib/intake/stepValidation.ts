import { cleanFreeText } from '@/lib/intake/answerMapper';
import {
  NO_FILES_MESSAGE,
  NO_LOCATION_MESSAGE,
  NO_OTHER_TEXT_MESSAGE,
} from '@/lib/intake/copy';
import { OTHER_LOCATION } from '@/lib/intake/options';
import type { IntakeChoices, IntakeStep } from '@/types/intake';

export type StepProblem =
  | { kind: 'no-files' }
  | { kind: 'no-location' }
  | { kind: 'no-other-text' };

export interface StepValidationContext {
  hasFiles: boolean;
  choices: IntakeChoices;
}

/** Returns the first problem that stops the Homeowner leaving a step, or null. */
export function validateStep(
  step: IntakeStep,
  ctx: StepValidationContext,
): StepProblem | null {
  if (step === 1) {
    return ctx.hasFiles ? null : { kind: 'no-files' };
  }
  if (step === 2) {
    const { location, placeText } = ctx.choices;
    if (location === null) return { kind: 'no-location' };
    if (location === OTHER_LOCATION && cleanFreeText(placeText) === '') {
      return { kind: 'no-other-text' };
    }
  }
  return null;
}

export function stepProblemMessage(problem: StepProblem): string {
  switch (problem.kind) {
    case 'no-files':
      return NO_FILES_MESSAGE;
    case 'no-location':
      return NO_LOCATION_MESSAGE;
    case 'no-other-text':
      return NO_OTHER_TEXT_MESSAGE;
  }
}
