'use client';

import type { Ref } from 'react';
import { LiveEmergencyNotice } from '@/components/intake/LiveEmergencyNotice';
import { ReviewList } from '@/components/intake/ReviewList';
import { StepHeading } from '@/components/intake/StepHeading';
import { DataRetentionNotice } from '@/components/upload/DataRetentionNotice';
import { UploadStatusPanel } from '@/components/upload/UploadStatusPanel';
import { ERROR_TEXT, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/components/ui/styles';
import type { UploadErrorKind, UploadFileProgress, UploadStatus } from '@/hooks/useUpload';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { IntakeChoices } from '@/types/intake';
import type { ContextAnswers } from '@/types/inspection';

export interface StepThreeProps {
  headingRef: Ref<HTMLHeadingElement>;
  choices: IntakeChoices;
  answers: ContextAnswers;
  files: AcceptedFiles | null;
  liveNoticeActive: boolean;
  uploadStatus: UploadStatus;
  fileProgress: UploadFileProgress[];
  uploadError: string | null;
  errorKind: UploadErrorKind | null;
  resetAt: string | null;
  /** True when the send button should look unavailable (not ready). */
  notReady: boolean;
  /** Message shown under the send button. */
  prompt: string | null;
  onChange: (step: 1 | 2) => void;
  onBack: () => void;
  onSubmit: () => void;
  onTryAgain: () => void;
  markNoticeVisible: () => void;
  /** Lets the parent scroll to the notice when it has not been seen. */
  noticeRef?: Ref<HTMLDivElement>;
}

export function StepThree({
  headingRef,
  choices,
  answers,
  files,
  liveNoticeActive,
  uploadStatus,
  fileProgress,
  uploadError,
  errorKind,
  resetAt,
  notReady,
  prompt,
  onChange,
  onBack,
  onSubmit,
  onTryAgain,
  markNoticeVisible,
  noticeRef,
}: StepThreeProps) {
  const busy = uploadStatus === 'uploading' || uploadStatus === 'analysing';
  const dim = 'disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="space-y-6">
      <StepHeading headingRef={headingRef}>Review and send</StepHeading>

      <LiveEmergencyNotice active={liveNoticeActive} />

      <ReviewList choices={choices} answers={answers} files={files} onChange={onChange} />

      <div ref={noticeRef}>
        <DataRetentionNotice onVisible={markNoticeVisible} />
      </div>

      <UploadStatusPanel
        uploadStatus={uploadStatus}
        fileProgress={fileProgress}
        uploadError={uploadError}
        errorKind={errorKind}
        resetAt={resetAt}
        onTryAgain={onTryAgain}
      />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          aria-disabled={busy || notReady ? 'true' : undefined}
          className={`h-[54px] w-full rounded-xl px-6 text-[17px] font-semibold ${dim} ${PRIMARY_BUTTON} ${
            notReady ? 'opacity-60' : ''
          }`}
        >
          Inspect my home
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className={`min-h-11 w-full rounded-xl px-6 text-base font-semibold ${dim} ${SECONDARY_BUTTON}`}
        >
          Back
        </button>
      </div>
      <div role="alert">
        {prompt && <p className={`text-sm font-medium ${ERROR_TEXT}`}>{prompt}</p>}
      </div>
    </div>
  );
}
