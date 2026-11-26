'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { GhostIcon } from '@/components/ui/haunted/GhostIcon';
import { StateText } from '@/components/ui/haunted/StateText';
import { ACCENT_TEXT, MUTED_TEXT, SECONDARY_BUTTON } from '@/components/ui/styles';
import { formatFileSize } from '@/lib/utils/formatFileSize';
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
const NO_FILES_TEXT = 'No photos or video added yet.';

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

/** "Your photos" card look (14 px card, Card tone="bare" supplies the Cobweb shell). */
const CARD_14_LOOK =
  'rounded-card border border-normal-card-border bg-normal-card p-4 text-normal-text haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text';
const THUMB_BOX =
  'bg-normal-table-head text-normal-muted haunted:bg-haunted-field haunted:text-haunted-muted';
const REMOVE_BUTTON = `min-h-11 rounded-[10px] px-3 text-[13px] font-medium ${SECONDARY_BUTTON}`;
const DROP_AREA =
  'border-normal-muted text-normal-text haunted:border-haunted-border haunted:text-haunted-text';
const DROP_AREA_ACTIVE =
  'border-normal-accent bg-normal-notice text-normal-text haunted:border-haunted-accent haunted:bg-haunted-field haunted:text-haunted-text';
const ADD_LABEL = [
  'inline-flex min-h-11 cursor-pointer items-center rounded-[10px] px-[18px] text-[15px] font-semibold',
  'bg-normal-accent text-normal-card hover:bg-normal-accent-hover',
  'haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover',
  'peer-focus-visible:ring-2 peer-focus-visible:ring-normal-accent peer-focus-visible:ring-offset-2',
  'haunted:peer-focus-visible:ring-haunted-accent haunted:peer-focus-visible:ring-offset-haunted-bg',
  'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
].join(' ');
const CLEAR_BUTTON = `min-h-11 px-1 text-[13px] font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg ${ACCENT_TEXT}`;

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
      onFilesAccepted({
        kind: 'frames',
        files: frames,
        source: { name: file.name, size: file.size },
      });
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

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!preparing) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (preparing) return;
    handleFiles(event.dataTransfer.files);
  };

  const photoCount = value && value.kind === 'images' ? value.files.length : 0;
  const atMax = photoCount >= MAX_IMAGES;
  const isVideo = value?.kind === 'frames';
  const buttonText = !value
    ? 'Choose photos or a video'
    : value.kind === 'frames'
      ? 'Choose a different video'
      : 'Add more photos';

  const fileInput = (
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
  );

  const videoName = value?.kind === 'frames' ? (value.source?.name ?? 'Your video') : '';
  const videoSize =
    value?.kind === 'frames'
      ? (value.source?.size ?? value.files.reduce((sum, f) => sum + f.size, 0))
      : 0;

  return (
    <section aria-label="Upload photos or a video" className="w-full">
      {!value && (
        <Card
          tone="bare"
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={[
            'flex flex-col items-center gap-4 rounded-card border-2 border-dashed p-8 text-center',
            dragging ? DROP_AREA_ACTIVE : `bg-normal-card haunted:bg-haunted-surface ${DROP_AREA}`,
          ].join(' ')}
        >
          <p className="text-lg font-semibold">Drag your photos or video here</p>
          <p className={`text-sm ${MUTED_TEXT}`}>
            Up to 5 photos (JPEG, PNG or WebP, 10 MB each) or one video (MP4 or WebM, 30 seconds or
            less).
          </p>

          {fileInput}
          <label htmlFor={inputId} className={ADD_LABEL}>
            {buttonText}
          </label>
        </Card>
      )}

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {preparing && (
          <p className="font-medium text-brand-900 haunted:text-haunted-text">
            Preparing your video…
          </p>
        )}
      </div>

      {!value && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-700 haunted:text-haunted-muted">
          <GhostIcon />
          <StateText plain={NO_FILES_TEXT} hauntedKey="noFiles" />
        </div>
      )}

      {value && (
        <Card
          tone="bare"
          as="section"
          aria-labelledby={`${inputId}-heading`}
          className={`mt-3 flex flex-col gap-3.5 ${CARD_14_LOOK}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${inputId}-heading`} className="text-base font-semibold">
              Your photos
            </h2>
            <span className={`text-[13px] font-medium ${MUTED_TEXT}`}>
              {isVideo ? '1 video' : `${photoCount} of ${MAX_IMAGES} photos`}
            </span>
          </div>

          {value.kind === 'images' ? (
            <ul className="flex flex-col gap-2.5">
              {value.files.map((file, i) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                  className="flex items-center gap-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl(file)}
                    alt={file.name}
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-all text-sm font-medium">{file.name}</span>
                    <span className={`text-xs ${MUTED_TEXT}`}>{formatFileSize(file.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(file)}
                    aria-label={`Remove ${file.name}`}
                    className={REMOVE_BUTTON}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2.5">
              <li className="flex items-center gap-3">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] ${THUMB_BOX}`}
                >
                  <svg
                    aria-hidden="true"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="5" width="13" height="14" rx="2" />
                    <path d="M16 10l5-3v10l-5-3" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="break-all text-sm font-medium">Video selected</p>
                  <p className={`break-all text-xs ${MUTED_TEXT}`}>
                    {videoName} · {formatFileSize(videoSize)}
                  </p>
                  <p className={`text-xs ${MUTED_TEXT}`}>
                    {value.files.length === 1
                      ? '1 frame prepared'
                      : `${value.files.length} frames prepared`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="Remove video"
                  className={REMOVE_BUTTON}
                >
                  Remove
                </button>
              </li>
            </ul>
          )}

          <div
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={[
              'flex flex-col items-center gap-2.5 rounded-xl border-2 border-dashed p-4 text-center',
              dragging ? DROP_AREA_ACTIVE : DROP_AREA,
            ].join(' ')}
          >
            <svg
              aria-hidden="true"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-normal-accent haunted:text-haunted-accent"
            >
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            {atMax ? (
              <p className="text-sm font-medium">You have added the maximum of 5 photos.</p>
            ) : (
              <>
                <span className={`text-sm ${MUTED_TEXT}`}>
                  {isVideo ? 'Drag a different video here, or' : 'Drag more photos here, or'}
                </span>
                {fileInput}
                <label htmlFor={inputId} className={ADD_LABEL}>
                  {buttonText}
                </label>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs leading-[17px] ${MUTED_TEXT}`}>
              JPEG, PNG or WebP, up to 10 MB each
            </span>
            <button type="button" onClick={clearSelection} className={CLEAR_BUTTON}>
              Clear selection
            </button>
          </div>
        </Card>
      )}

      <div id={errorsId} aria-live="assertive" role="alert" className="mt-3">
        {errors.map((error, i) => (
          <p
            key={`${error.code}-${i}`}
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 haunted:border-haunted-error haunted:bg-haunted-surface haunted:text-haunted-error"
          >
            {error.message}
          </p>
        ))}
        {failure && !preparing && (
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void runVideo(failure.file)}
              className="min-h-11 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-900 haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover haunted:focus-visible:outline-haunted-accent"
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
