'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpload } from '@/hooks/useUpload';
import { DropZone } from '@/components/upload/DropZone';
import { ContextForm } from '@/components/upload/ContextForm';
import { DataRetentionNotice } from '@/components/upload/DataRetentionNotice';
import { UploadProgress } from '@/components/upload/UploadProgress';

const NOTICE_PROMPT = 'Please read the notice below before sending.';
const NO_FILES_PROMPT = 'Please add a photo or a short video first.';

const focusRing =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:focus-visible:outline-haunted-accent';

function formatResetTime(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
  const analysingRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const hasFiles = files !== null && files.files.length > 0;
  const ready = canSubmit && hasFiles;
  const busy = uploadStatus === 'uploading' || uploadStatus === 'analysing';
  const hasError = uploadStatus === 'error';
  const isRateLimit = hasError && errorKind === 'rate_limit';

  useEffect(() => {
    if (uploadStatus === 'analysing') analysingRef.current?.focus();
  }, [uploadStatus]);

  useEffect(() => {
    if (hasError) errorRef.current?.focus();
  }, [hasError]);

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

  const resetTime = formatResetTime(resetAt);

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

      {uploadStatus === 'uploading' && <UploadProgress files={fileProgress} />}

      <div role="status" aria-live="polite">
        {uploadStatus === 'analysing' && (
          <p
            ref={analysingRef}
            tabIndex={-1}
            className="text-lg font-medium text-brand-900 focus:outline-none haunted:text-haunted-text"
          >
            Inspecting your home…
          </p>
        )}
      </div>

      {hasError && (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className={
            isRateLimit
              ? 'rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900 focus:outline-none haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text'
              : 'rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 focus:outline-none haunted:border-red-400 haunted:bg-haunted-surface haunted:text-red-300'
          }
        >
          {isRateLimit ? (
            <>
              <p className="font-medium">
                You have reached today&apos;s limit of free inspections.
              </p>
              <p className="mt-1 text-sm">
                {resetTime
                  ? `You can try again after ${resetTime}.`
                  : 'Please come back tomorrow to inspect another problem.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                {uploadError ?? 'Something went wrong. Please try again.'}
              </p>
              {errorKind === 'timeout' && (
                <p className="mt-1 text-sm">
                  This can happen on a slow connection. Your photos and answers are still here.
                </p>
              )}
              <button
                type="button"
                onClick={reset}
                className={`mt-3 min-h-11 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 haunted:bg-haunted-glow haunted:hover:bg-haunted-accent ${focusRing}`}
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          aria-disabled={busy || !ready ? 'true' : undefined}
          className={`min-h-12 w-full rounded-lg bg-brand-700 px-6 py-3 text-lg font-semibold text-white hover:bg-brand-800 haunted:bg-haunted-glow haunted:hover:bg-haunted-accent ${focusRing} ${
            busy || !ready ? 'cursor-not-allowed opacity-60' : ''
          }`}
        >
          Inspect my home
        </button>
        <div role="alert" className="mt-2">
          {prompt && (
            <p className="text-sm font-medium text-red-700 haunted:text-red-300">{prompt}</p>
          )}
        </div>
      </div>
    </div>
  );
}
