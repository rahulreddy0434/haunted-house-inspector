'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { extractFrames } from '@/lib/frameExtractor';
import type { FrameExtractionError, FrameExtractionResult } from '@/lib/frameExtractor';
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  validateSelection,
  validateVideoDuration,
} from '@/lib/validation/mediaValidation';
import type { AcceptedFiles, UploadValidationError } from '@/lib/validation/mediaValidation';

export interface DropZoneProps {
  onFilesAccepted: (files: AcceptedFiles) => void;
  onValidationError: (errors: UploadValidationError[]) => void;
  /** Optional: called when the user removes a previously accepted selection. */
  onSelectionCleared?: () => void;
}

const ACCEPT_ATTR = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(',');
const METADATA_TIMEOUT_MS = 15_000;

interface Selection {
  names: string[];
  label: string;
}

interface ExtractionFailure {
  file: File;
  error: UploadValidationError;
}

function isExtractionError(
  result: FrameExtractionResult | FrameExtractionError,
): result is FrameExtractionError {
  return !('frames' in result);
}

/**
 * Read a video's duration with an off-screen element. Resolves to null when the
 * duration cannot be read (the frame extractor then reports the real problem).
 * The object URL is always revoked.
 */
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), METADATA_TIMEOUT_MS);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export function DropZone({ onFilesAccepted, onValidationError, onSelectionCleared }: DropZoneProps) {
  const inputId = useId();
  const errorsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0); // incremented to ignore results of superseded runs
  const mountedRef = useRef(true);

  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [errors, setErrors] = useState<UploadValidationError[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [failure, setFailure] = useState<ExtractionFailure | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reportErrors = useCallback(
    (list: UploadValidationError[]) => {
      setErrors(list);
      setSelection(null);
      onValidationError(list);
    },
    [onValidationError],
  );

  const runVideo = useCallback(
    async (file: File) => {
      const run = ++runRef.current;
      const stale = () => !mountedRef.current || run !== runRef.current;

      setErrors([]);
      setFailure(null);
      setPreparing(true);
      setSelection({ names: [file.name], label: '1 video' });

      const duration = await readVideoDuration(file);
      if (stale()) return;
      if (duration !== null) {
        const tooLong = validateVideoDuration(duration);
        if (tooLong) {
          setPreparing(false);
          reportErrors([{ ...tooLong, affectedFiles: [file.name] }]);
          return;
        }
      }

      const result = await extractFrames(file);
      if (stale()) return;
      setPreparing(false);

      if (isExtractionError(result)) {
        const error: UploadValidationError = {
          code: result.code === 'TIMEOUT' ? 'EXTRACTION_TIMEOUT' : 'EXTRACTION_FAILED',
          message: result.message,
          affectedFiles: [file.name],
        };
        setFailure({ file, error });
        setErrors([error]);
        onValidationError([error]);
        return;
      }

      const frames = result.frames.map(
        (blob, i) => new File([blob], `frame-${i + 1}.jpg`, { type: 'image/jpeg' }),
      );
      onFilesAccepted({ kind: 'frames', files: frames });
    },
    [onFilesAccepted, onValidationError, reportErrors],
  );

  const handleFiles = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      if (files.length === 0) return;
      runRef.current += 1; // supersede anything in flight
      setPreparing(false);
      setFailure(null);

      const problems = validateSelection(files);
      if (problems.length > 0) {
        reportErrors(problems);
        return;
      }

      const video = files.find((f) => ACCEPTED_VIDEO_TYPES.includes(f.type));
      if (video) {
        void runVideo(video);
        return;
      }

      setErrors([]);
      setSelection({
        names: files.map((f) => f.name),
        label: files.length === 1 ? '1 photo' : `${files.length} photos`,
      });
      onFilesAccepted({ kind: 'images', files });
    },
    [onFilesAccepted, reportErrors, runVideo],
  );

  const clearSelection = useCallback(() => {
    runRef.current += 1;
    setPreparing(false);
    setFailure(null);
    setErrors([]);
    setSelection(null);
    if (inputRef.current) inputRef.current.value = '';
    onSelectionCleared?.();
  }, [onSelectionCleared]);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = ''; // allow choosing the same file again
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!preparing) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (preparing) return;
    handleFiles(event.dataTransfer.files);
  };

  const buttonText = selection ? 'Choose different files' : 'Choose photos or a video';

  return (
    <section aria-label="Upload photos or a video" className="w-full">
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          'flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          'border-brand-300 bg-brand-50 text-slate-900',
          'haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text',
          dragging
            ? 'border-brand-600 bg-brand-100 haunted:border-haunted-accent haunted:bg-haunted-bg haunted:shadow-haunted-glow'
            : '',
        ].join(' ')}
      >
        <p className="text-lg font-semibold">Drag your photos or video here</p>
        <p className="text-sm text-slate-700 haunted:text-haunted-muted">
          Up to 5 photos (JPEG, PNG or WebP, 10 MB each) or one video (MP4 or WebM, 30 seconds or
          less).
        </p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          onChange={onInputChange}
          disabled={preparing}
          aria-describedby={errors.length > 0 ? errorsId : undefined}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className={[
            'inline-flex min-h-11 cursor-pointer items-center rounded-lg px-5 py-2 font-medium',
            'bg-brand-700 text-white hover:bg-brand-800',
            'haunted:bg-haunted-glow haunted:text-white haunted:hover:bg-haunted-accent',
            'peer-focus-visible:outline peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2',
            'peer-focus-visible:outline-brand-900 haunted:peer-focus-visible:outline-haunted-accent',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          ].join(' ')}
        >
          {buttonText}
        </label>
      </div>

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {preparing && (
          <p className="font-medium text-brand-900 haunted:text-haunted-text">
            Preparing your video…
          </p>
        )}
      </div>

      {selection && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-white p-4 text-slate-900 haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text">
          <p className="font-medium">Selected: {selection.label}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {selection.names.map((name, i) => (
              <li key={`${name}-${i}`} className="break-all">
                {name}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearSelection}
            className="mt-3 min-h-11 rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:border-haunted-accent haunted:text-haunted-text haunted:hover:bg-haunted-bg haunted:focus-visible:outline-haunted-accent"
          >
            Remove selection
          </button>
        </div>
      )}

      <div id={errorsId} aria-live="assertive" role="alert" className="mt-3">
        {errors.map((error) => (
          <p
            key={error.code}
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 haunted:border-red-400 haunted:bg-haunted-surface haunted:text-red-300"
          >
            {error.message}
          </p>
        ))}
        {failure && !preparing && (
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runVideo(failure.file)}
              className="min-h-11 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:bg-haunted-glow haunted:hover:bg-haunted-accent haunted:focus-visible:outline-haunted-accent"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                clearSelection();
                inputRef.current?.focus();
              }}
              className="min-h-11 rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:border-haunted-accent haunted:text-haunted-text haunted:hover:bg-haunted-bg haunted:focus-visible:outline-haunted-accent"
            >
              Use photos instead
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
