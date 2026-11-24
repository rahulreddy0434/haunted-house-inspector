'use client';

import type { Dispatch, Ref } from 'react';
import { ChipGroup } from '@/components/intake/ChipGroup';
import { FreeTextField } from '@/components/intake/FreeTextField';
import { LiveEmergencyNotice } from '@/components/intake/LiveEmergencyNotice';
import { StepHeading } from '@/components/intake/StepHeading';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ui/styles';
import { exactPlaceLimit, somethingElseLimit } from '@/lib/intake/answerMapper';
import { NO_LOCATION_MESSAGE, NO_OTHER_TEXT_MESSAGE } from '@/lib/intake/copy';
import type { IntakeAction } from '@/lib/intake/intakeReducer';
import {
  DURATION_OPTIONS,
  EXTRAS_OPTIONS,
  LOCATION_OPTIONS,
  OTHER_LOCATION,
  SOMETHING_ELSE,
} from '@/lib/intake/options';
import type { StepProblem } from '@/lib/intake/stepValidation';
import type { IntakeChoices } from '@/types/intake';

/** Ids the parent uses to focus the first invalid control. */
export const LOCATION_FIRST_INPUT_ID = 'intake-location-first';
export const PLACE_TEXT_ID = 'intake-place-text';
export const SOMETHING_ELSE_TEXT_ID = 'intake-something-else-text';

export interface StepTwoProps {
  headingRef: Ref<HTMLHeadingElement>;
  choices: IntakeChoices;
  dispatch: Dispatch<IntakeAction>;
  problem: StepProblem | null;
  liveNoticeActive: boolean;
  onBack: () => void;
  onNext: () => void;
}

const toOptions = <T extends string>(list: readonly T[]) =>
  list.map((v) => ({ value: v, label: v }));
const LOCATION_CHIPS = toOptions(LOCATION_OPTIONS);
const DURATION_CHIPS = toOptions(DURATION_OPTIONS);
const EXTRAS_CHIPS = toOptions(EXTRAS_OPTIONS);

const NAV_BUTTON = 'min-h-12 min-w-11 flex-1 rounded-lg px-6 py-3 text-lg font-semibold';

export function StepTwo({
  headingRef,
  choices,
  dispatch,
  problem,
  liveNoticeActive,
  onBack,
  onNext,
}: StepTwoProps) {
  const isOther = choices.location === OTHER_LOCATION;

  return (
    <div className="space-y-6">
      <StepHeading headingRef={headingRef}>A few quick questions</StepHeading>

      <LiveEmergencyNotice active={liveNoticeActive} />

      <ChipGroup
        legend="Where is the problem?"
        name="intake-location"
        mode="single"
        required
        options={LOCATION_CHIPS}
        selected={choices.location ? [choices.location] : []}
        onSelect={(value) => dispatch({ type: 'setLocation', value })}
        onClear={() => dispatch({ type: 'setLocation', value: null })}
        error={problem?.kind === 'no-location' ? NO_LOCATION_MESSAGE : null}
        firstInputId={LOCATION_FIRST_INPUT_ID}
      />

      <FreeTextField
        id={PLACE_TEXT_ID}
        label="Exact place"
        hint="Optional, unless you chose Other."
        example="under the sink"
        value={choices.placeText}
        onChange={(value) => dispatch({ type: 'setPlaceText', value })}
        limit={exactPlaceLimit(choices.location)}
        required={isOther}
        error={problem?.kind === 'no-other-text' ? NO_OTHER_TEXT_MESSAGE : null}
      />

      <ChipGroup
        legend="How long has this been going on?"
        name="intake-duration"
        mode="single"
        options={DURATION_CHIPS}
        selected={choices.duration ? [choices.duration] : []}
        onSelect={(value) => dispatch({ type: 'setDuration', value })}
        onClear={() => dispatch({ type: 'setDuration', value: null })}
      />

      <ChipGroup
        legend="Anything else? Choose all that apply."
        name="intake-extras"
        mode="multiple"
        options={EXTRAS_CHIPS}
        selected={choices.extras}
        onSelect={(value) => dispatch({ type: 'toggleExtra', value })}
      />

      {choices.extras.includes(SOMETHING_ELSE) && (
        <FreeTextField
          id={SOMETHING_ELSE_TEXT_ID}
          label="Tell us more"
          value={choices.somethingElseText}
          onChange={(value) => dispatch({ type: 'setSomethingElseText', value })}
          limit={somethingElseLimit(choices)}
          multiline
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onBack} className={`${NAV_BUTTON} ${SECONDARY_BUTTON}`}>
          Back
        </button>
        <button type="button" onClick={onNext} className={`${NAV_BUTTON} ${PRIMARY_BUTTON}`}>
          Next
        </button>
      </div>
    </div>
  );
}
