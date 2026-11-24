'use client';

import type { Ref } from 'react';
import { ChipGroup } from '@/components/intake/ChipGroup';
import { LiveEmergencyNotice } from '@/components/intake/LiveEmergencyNotice';
import { SampleButton } from '@/components/intake/SampleButton';
import { StepHeading } from '@/components/intake/StepHeading';
import { DropZone } from '@/components/upload/DropZone';
import { ERROR_TEXT, PRIMARY_BUTTON } from '@/components/ui/styles';
import { NO_FILES_MESSAGE } from '@/lib/intake/copy';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import type { StepProblem } from '@/lib/intake/stepValidation';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { IntakeChoices, SafetyChipId } from '@/types/intake';

export interface StepOneProps {
  headingRef: Ref<HTMLHeadingElement>;
  choices: IntakeChoices;
  onToggleSafety: (id: SafetyChipId) => void;
  files: AcceptedFiles | null;
  onFilesAccepted: (f: AcceptedFiles) => void;
  onSelectionCleared: () => void;
  onSample: () => void;
  sampleError: string | null;
  problem: StepProblem | null;
  onNext: () => void;
}

const SAFETY_OPTIONS = SAFETY_CHIPS.map((c) => ({ value: c.id, label: c.label }));
const noop = () => {};

export function StepOne({
  headingRef,
  choices,
  onToggleSafety,
  files,
  onFilesAccepted,
  onSelectionCleared,
  onSample,
  sampleError,
  problem,
  onNext,
}: StepOneProps) {
  const hasFiles = files !== null && files.files.length > 0;
  const message = problem?.kind === 'no-files' ? NO_FILES_MESSAGE : sampleError;

  return (
    <div className="space-y-6">
      <StepHeading headingRef={headingRef}>Safety check and photos</StepHeading>

      <ChipGroup
        legend="Is any of this happening right now? Choose all that apply."
        name="intake-safety"
        mode="multiple"
        options={SAFETY_OPTIONS}
        selected={choices.safety}
        onSelect={onToggleSafety}
      />

      <LiveEmergencyNotice active={choices.safety.length > 0} />

      <DropZone
        value={files}
        onFilesAccepted={onFilesAccepted}
        onValidationError={noop}
        onSelectionCleared={onSelectionCleared}
      />

      {!hasFiles && <SampleButton onClick={onSample} />}

      <div role="alert">
        {message && <p className={`text-sm font-medium ${ERROR_TEXT}`}>{message}</p>}
      </div>

      <button
        type="button"
        onClick={onNext}
        className={`min-h-12 min-w-11 w-full rounded-lg px-6 py-3 text-lg font-semibold ${PRIMARY_BUTTON}`}
      >
        Next
      </button>
    </div>
  );
}
