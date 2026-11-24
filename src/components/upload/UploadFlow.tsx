'use client';

import { useCallback, useRef, useState } from 'react';
import { useUpload } from '@/hooks/useUpload';
import { DropZone } from '@/components/upload/DropZone';
import { ContextForm } from '@/components/upload/ContextForm';
import { DataRetentionNotice } from '@/components/upload/DataRetentionNotice';
import { UploadStatusPanel } from '@/components/upload/UploadStatusPanel';
import { prefersReducedMotion } from '@/lib/utils/prefersReducedMotion';

const NOTICE_PROMPT = 'Please read the notice below before sending.';
const NO_FILES_PROMPT = 'Please add a photo or a short video first.';

const focusRing =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:focus-visible:outline-haunted-accent';

export function UploadFlow() {
  const {
    answers,
    noticeVisible,
    uploadStatus,
    uploadError,
    errorKind,
    resetAt,
    fileProgress,
    files,
    canSubmit,
    setFiles,
    clearFiles,
    setAnswers,
    markNoticeVisible,
    submit,
    reset,
  } = useUpload();

  const [showErrors, setShowErrors] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const hasFiles = files !== null && files.files.length > 0;
  const ready = canSubmit && hasFiles;
  const busy = uploadStatus === 'uploading' || uploadStatus === 'analysing';

  const handleNoop = useCallback(() => {}, []);
  const handleCleared = useCallback(() => {
    // Removes the files only; the answers are kept.
    clearFiles();
    setPrompt(null);
  }, [clearFiles]);

  const handleSubmit = () => {
    if (busy) return;
    setShowErrors(true);
    if (!ready) {
      if (!hasFiles) {
        setPrompt(NO_FILES_PROMPT);
      } else if (!noticeVisible) {
        setPrompt(NOTICE_PROMPT);
      } else {
        setPrompt(null);
      }
      if (!noticeVisible) {
        noticeRef.current?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
      }
      return;
    }
    setPrompt(null);
    void submit();
  };

  return (
    <div className="space-y-8">
      <DropZone
        value={files}
        onFilesAccepted={(accepted) => {
          setFiles(accepted);
          setPrompt(null);
        }}
        onValidationError={handleNoop}
        onSelectionCleared={handleCleared}
      />

      <ContextForm
        value={answers}
        onChange={setAnswers}
        onValidationChange={handleNoop}
        showErrors={showErrors}
      />

      <div ref={noticeRef}>
        <DataRetentionNotice onVisible={markNoticeVisible} />
      </div>

      <UploadStatusPanel
        uploadStatus={uploadStatus}
        fileProgress={fileProgress}
        uploadError={uploadError}
        errorKind={errorKind}
        resetAt={resetAt}
        onTryAgain={reset}
      />

      <div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          aria-disabled={busy || !ready ? 'true' : undefined}
          className={`min-h-12 w-full rounded-lg bg-brand-700 px-6 py-3 text-lg font-semibold text-white hover:bg-brand-800 haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover ${focusRing} ${
            busy || !ready ? 'cursor-not-allowed opacity-60' : ''
          }`}
        >
          Inspect my home
        </button>
        <div role="alert" className="mt-2">
          {prompt && (
            <p className="text-sm font-medium text-red-700 haunted:text-haunted-error">{prompt}</p>
          )}
        </div>
      </div>
    </div>
  );
}
