'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { extractFrames } from '@/lib/frameExtractor';
import type { FrameExtractionError, FrameExtractionResult } from '@/lib/frameExtractor';
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGES,
  mergeSelection,
  validateVideoDuration,
} from '@/lib/validation/mediaValidation';
import type {
  AcceptedFiles,
  CurrentSelection,
  UploadValidationError,
} from '@/lib/validation/mediaValidation';

export interface DropZoneProps {
  /** The current selection, owned by the parent. */
  value: AcceptedFiles | null;
  onFilesAccepted: (files: AcceptedFiles) => void;
  onValidationError: (errors: UploadValidationError[]) => void;
  /** Called when the user removes the whole selection (or the last photo). */
  onSelectionCleared?: () => void;
}

const ACCEPT_ATTR = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(',');
const METADATA_TIMEOUT_MS = 15_000;

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

function toCurrent(value: AcceptedFiles | null): CurrentSelection<File> | null {
  if (!value) return null;
  return { kind: value.kind === 'images' ? 'images' : 'video', files: value.files };
}

const secondaryButton =
  'min-h-11 rounded-lg border border-brand-700 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:border-haunted-accent haunted:text-haunted-text haunted:hover:bg-haunted-bg haunted:focus-visible:outline-haunted-accent';

export function DropZone({
  value,
  onFilesAccepted,
  onValidationError,
  onSelectionCleared,
}: DropZoneProps) {
  const inputId = useId();
  const errorsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0); // incremented to ignore results of superseded runs
  const mountedRef = useRef(true);
  const urlsRef = useRef<Map<File, string>>(new Map());
  const cleanedUpRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const [, setRemountTick] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [errors, setErrors] = useState<UploadValidationError[]>([]);
  const [failure, setFailure] = useState<ExtractionFailure | null>(null);

  // Revoke every preview URL on unmount.
  useEffect(() => {
    mountedRef.current = true;
    const urls = urlsRef.current;
    if (cleanedUpRef.current) {
      cleanedUpRef.current = false;
      setRemountTick((t) => t + 1); // re-create URLs revoked by a simulated unmount
    }
    return () => {
      mountedRef.current = false;
      cleanedUpRef.current = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Revoke the URL of any File that is no longer in `value`.
  useEffect(() => {
    const current = new Set<File>(value && value.kind === 'images' ? value.files : []);
    urlsRef.current.forEach((url, file) => {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        urlsRef.current.delete(file);
      }
    });
  }, [value]);

  const previewUrl = (file: File): string => {
    let url = urlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      urlsRef.current.set(file, url);
    }
    return url;
  };

  const reportErrors = useCallback(
    (list: UploadValidationError[]) => {
      setErrors(list);
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

      const current = valueRef.current;
      const merge = mergeSelection<File>(toCurrent(current), files);

      if (!merge.accepted) {
        reportErrors(merge.errors); // the selection stays as it was
        return;
      }

      const hasVideo = files.some((f) => ACCEPTED_VIDEO_TYPES.includes(f.type));
      if (hasVideo) {
        void runVideo(files[0]);
        return;
      }

      const before = current && current.kind === 'images' ? current.files.length : 0;
      if (merge.errors.length > 0) {
        setErrors(merge.errors);
        onValidationError(merge.errors);
      } else {
        setErrors([]);
      }
      if (merge.files.length !== before || merge.errors.length > 0) {
        onFilesAccepted({ kind: 'images', files: merge.files });
      }
    },
    [onFilesAccepted, onValidationError, reportErrors, runVideo],
  );

  const clearSelection = useCallback(() => {
    runRef.current += 1;
    setPreparing(false);
    setFailure(null);
    setErrors([]);
    if (inputRef.current) inputRef.current.value = '';
    onSelectionCleared?.();
  }, [onSelectionCleared]);

  const removePhoto = (file: File) => {
    if (!value || value.kind !== 'images') return;
    const url = urlsRef.current.get(file);
    if (url) {
      URL.revokeObjectURL(url);
      urlsRef.current.delete(file);
    }
    const remaining = value.files.filter((f) => f !== file);
    setErrors([]);
    if (remaining.length === 0) onSelectionCleared?.();
    else onFilesAccepted({ kind: 'images', files: remaining });
  };

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

  const photoCount = value && value.kind === 'images' ? value.files.length : 0;
  const atMax = photoCount >= MAX_IMAGES;
  const buttonText = !value
    ? 'Choose photos or a video'
    : value.kind === 'frames'
      ? 'Choose a different video'
      : 'Add more photos';

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

        {atMax ? (
          <p className="text-sm font-medium">You have added the maximum of 5 photos.</p>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {preparing && (
          <p className="font-medium text-brand-900 haunted:text-haunted-text">
            Preparing your video…
          </p>
        )}
      </div>

      {value && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-white p-4 text-slate-900 haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text">
          {value.kind === 'images' ? (
            <>
              <p className="font-medium">
                Selected: {photoCount === 1 ? '1 photo' : `${photoCount} photos`}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {value.files.map((file, i) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}-${i}`} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl(file)}
                      alt={file.name}
                      width={64}
                      height={64}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                    <span className="min-w-0 flex-1 break-all text-sm">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePhoto(file)}
                      aria-label={`Remove ${file.name}`}
                      className={secondaryButton}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Video selected</p>
                <p className="text-sm">
                  {value.files.length === 1
                    ? '1 frame prepared'
                    : `${value.files.length} frames prepared`}
                </p>
              </div>
              <button type="button" onClick={clearSelection} className={secondaryButton}>
                Remove video
              </button>
            </div>
          )}
          <button type="button" onClick={clearSelection} className={`mt-3 ${secondaryButton}`}>
            Clear selection
          </button>
        </div>
      )}

      <div id={errorsId} aria-live="assertive" role="alert" className="mt-3">
        {errors.map((error, i) => (
          <p
            key={`${error.code}-${i}`}
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
              className={secondaryButton}
            >
              Use photos instead
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
