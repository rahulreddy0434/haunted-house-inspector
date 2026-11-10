'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContextAnswers } from '@/types/inspection';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import { isLocationValid } from '@/lib/utils/contextAnswers';
import { cacheResult } from '@/lib/sessionResultCache';
import { runUploadFlow, type FileProgressStatus } from '@/lib/uploadFlow';

export type UploadStatus = 'idle' | 'uploading' | 'analysing' | 'done' | 'error';
export type UploadErrorKind = 'rate_limit' | 'timeout' | 'upload' | 'analysis' | 'validation';

export interface UploadFileProgress {
  name: string;
  progress: number;
  status: FileProgressStatus;
}

export interface UseUploadReturn {
  // State
  files: AcceptedFiles | null;
  answers: ContextAnswers;
  noticeVisible: boolean;
  uploadStatus: UploadStatus;
  uploadError: string | null;
  inspectionId: string | null;
  fileProgress: UploadFileProgress[];
  canSubmit: boolean;
  errorKind: UploadErrorKind | null;
  resetAt: string | null;

  // Actions
  setFiles: (files: AcceptedFiles) => void;
  setAnswers: (answers: ContextAnswers) => void;
  markNoticeVisible: () => void;
  submit: () => Promise<void>;
  /** Clears status/error/progress but keeps files and answers. */
  reset: () => void;
  /** Clears everything. */
  clearAll: () => void;
}

const EMPTY_ANSWERS: ContextAnswers = { location: '', duration: '', recentChanges: '' };

export function useUpload(): UseUploadReturn {
  const router = useRouter();
  const [files, setFilesState] = useState<AcceptedFiles | null>(null);
  const [answers, setAnswersState] = useState<ContextAnswers>(EMPTY_ANSWERS);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<UploadErrorKind | null>(null);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [fileProgress, setFileProgress] = useState<UploadFileProgress[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const setFiles = useCallback((next: AcceptedFiles) => setFilesState(next), []);
  const setAnswers = useCallback((next: ContextAnswers) => setAnswersState(next), []);
  const markNoticeVisible = useCallback(() => setNoticeVisible(true), []);

  const clearStatus = useCallback(() => {
    setUploadStatus('idle');
    setUploadError(null);
    setErrorKind(null);
    setResetAt(null);
    setInspectionId(null);
    setFileProgress([]);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearStatus();
  }, [clearStatus]);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    clearStatus();
    setFilesState(null);
    setAnswersState(EMPTY_ANSWERS);
  }, [clearStatus]);

  const submit = useCallback(async () => {
    const fail = (kind: UploadErrorKind, message: string) => {
      setUploadStatus('error');
      setUploadError(message);
      setErrorKind(kind);
    };

    if (!isLocationValid(answers.location)) {
      fail('validation', 'Please tell us where the problem is.');
      return;
    }
    if (!files || files.files.length === 0 || !noticeVisible) {
      fail('validation', 'Please add a photo and read the notice before sending.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setUploadError(null);
    setErrorKind(null);
    setResetAt(null);
    setInspectionId(null);
    setUploadStatus('uploading');
    setFileProgress(
      files.files.map((f) => ({ name: f.name, progress: 0, status: 'pending' as const })),
    );

    const outcome = await runUploadFlow({
      files,
      answers,
      signal: controller.signal,
      onProgress: (u) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setFileProgress((prev) =>
          prev.map((p, i) => (i === u.index ? { ...p, progress: u.progress, status: u.status } : p)),
        );
      },
      onAnalysing: () => {
        if (mountedRef.current && !controller.signal.aborted) setUploadStatus('analysing');
      },
    });

    if (!mountedRef.current || controller.signal.aborted) return;

    if (!outcome.ok) {
      if (outcome.kind === 'cancelled') return;
      fail(outcome.kind, outcome.message);
      if ('resetAt' in outcome && outcome.resetAt) setResetAt(outcome.resetAt);
      return;
    }

    // Cache first (failures are swallowed), then navigate. Emergency results take this path too.
    cacheResult(outcome.result);
    setInspectionId(outcome.result.id);
    setUploadStatus('done');
    router.push(`/inspect/${outcome.result.id}`);
  }, [answers, files, noticeVisible, router]);

  const canSubmit = files !== null && isLocationValid(answers.location) && noticeVisible;

  return {
    files,
    answers,
    noticeVisible,
    uploadStatus,
    uploadError,
    inspectionId,
    fileProgress,
    canSubmit,
    errorKind,
    resetAt,
    setFiles,
    setAnswers,
    markNoticeVisible,
    submit,
    reset,
    clearAll,
  };
}
