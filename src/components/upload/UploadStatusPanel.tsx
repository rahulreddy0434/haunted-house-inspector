'use client';

import { useEffect, useRef } from 'react';
import type { UploadErrorKind, UploadFileProgress, UploadStatus } from '@/hooks/useUpload';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { Card } from '@/components/ui/Card';
import { StateText } from '@/components/ui/haunted/StateText';
import { ANALYSIS_FAILED_SAFETY_LINE } from '@/lib/jobs/copy';

const focusRing =
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:focus-visible:outline-haunted-accent';

function formatResetTime(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export interface UploadStatusPanelProps {
  uploadStatus: UploadStatus;
  fileProgress: UploadFileProgress[];
  uploadError: string | null;
  errorKind: UploadErrorKind | null;
  resetAt: string | null;
  onTryAgain: () => void;
}

export function UploadStatusPanel({
  uploadStatus,
  fileProgress,
  uploadError,
  errorKind,
  resetAt,
  onTryAgain,
}: UploadStatusPanelProps) {
  const analysingRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const hasError = uploadStatus === 'error';
  const isRateLimit = hasError && errorKind === 'rate_limit';

  useEffect(() => {
    if (uploadStatus === 'analysing') analysingRef.current?.focus();
  }, [uploadStatus]);

  useEffect(() => {
    if (hasError) errorRef.current?.focus();
  }, [hasError]);

  const resetTime = formatResetTime(resetAt);

  return (
    <>
      <div role="status" aria-live="polite">
        {uploadStatus === 'uploading' && (
          <p className="text-lg font-medium text-brand-900 haunted:text-haunted-text">
            Uploading photos
          </p>
        )}
        {uploadStatus === 'analysing' && (
          <div ref={analysingRef} tabIndex={-1} className="focus:outline-none">
            <StateText
              plain="Checking for safety and reading your photos"
              hauntedKey="inspecting"
              className="text-lg font-medium text-brand-900 haunted:text-haunted-text"
            />
          </div>
        )}
      </div>

      {uploadStatus === 'uploading' && <UploadProgress files={fileProgress} />}

      {hasError && (
        <Card
          tone="bare"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className={
            isRateLimit
              ? 'rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900 focus:outline-none haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text'
              : 'rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 focus:outline-none haunted:border-haunted-error haunted:bg-haunted-surface haunted:text-haunted-error'
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
              {(errorKind === 'analysis' || errorKind === 'timeout') && (
                <p className="mt-2 text-sm font-medium">{ANALYSIS_FAILED_SAFETY_LINE}</p>
              )}
              <button
                type="button"
                onClick={onTryAgain}
                className={`mt-3 min-h-11 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover ${focusRing}`}
              >
                Try again
              </button>
            </>
          )}
        </Card>
      )}
    </>
  );
}
