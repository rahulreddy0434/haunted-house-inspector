/**
 * Client-side video frame extraction (Requirement 3).
 * Uses only browser-native HTMLVideoElement + canvas. Do NOT import server-only modules here.
 */

export interface FrameExtractionResult {
  /** 1–5 JPEG blobs */
  frames: Blob[];
  /** Seconds, parallel array to `frames` */
  timestamps: number[];
}

export interface FrameExtractionError {
  code: 'TIMEOUT' | 'UNSUPPORTED' | 'PROCESSING_ERROR';
  message: string;
}

const MAX_DURATION_SECONDS = 30;
const TIMEOUT_MS = 15_000;
const MIN_SHORT_SIDE_PX = 640;
const JPEG_QUALITY = 0.82;
/** Keep seeks this far from the very end so the browser has a frame to show. */
const END_SEEK_MARGIN = 0.05;

/**
 * Pure helper: compute the frame timestamps (seconds) for a video duration.
 *
 * - duration < 1 s:        exactly one frame at 0
 * - 1 s <= duration < 3 s: whole seconds 1..floor(duration)
 * - duration >= 3 s:       n evenly spaced frames, where n = 5 if d >= 5, 4 if d >= 4, else 3.
 *   Timestamps are the midpoints of n equal segments, t_i = d * (i + 0.5) / n, so spacing
 *   is exactly d / n and every timestamp lies strictly inside (0, d), never at the end.
 *
 * Invalid durations (NaN, non-positive, infinite) yield an empty array.
 */
export function computeFrameTimestamps(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  if (duration < 1) return [0];
  if (duration < 3) {
    const count = Math.floor(duration);
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const count = duration >= 5 ? 5 : duration >= 4 ? 4 : 3;
  return Array.from({ length: count }, (_, i) => (duration * (i + 0.5)) / count);
}

class ExtractionFailure extends Error {
  constructor(
    readonly code: FrameExtractionError['code'],
    message: string,
  ) {
    super(message);
  }
}

function waitForEvent(
  video: HTMLVideoElement,
  okEvent: string,
  failure: ExtractionFailure,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(failure);
    };
    const cleanup = () => {
      video.removeEventListener(okEvent, onOk);
      video.removeEventListener('error', onError);
    };
    video.addEventListener(okEvent, onOk);
    video.addEventListener('error', onError);
  });
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(time, 0), Math.max(video.duration - END_SEEK_MARGIN, 0));
  if (Math.abs(video.currentTime - target) < 1e-3 && video.readyState >= 2) return;
  const seeked = waitForEvent(
    video,
    'seeked',
    new ExtractionFailure('PROCESSING_ERROR', 'Could not read a frame from the video.'),
  );
  video.currentTime = target;
  await seeked;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ExtractionFailure('PROCESSING_ERROR', 'Could not encode a video frame.'));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function runExtraction(
  video: HTMLVideoElement,
  url: string,
  isCancelled: () => boolean,
): Promise<FrameExtractionResult> {
  const metadata = waitForEvent(
    video,
    'loadedmetadata',
    new ExtractionFailure(
      'UNSUPPORTED',
      'This video format is not supported. Try a different video or upload photos instead.',
    ),
  );
  video.src = url;
  await metadata;

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ExtractionFailure('PROCESSING_ERROR', 'Could not determine the video length.');
  }
  if (duration > MAX_DURATION_SECONDS) {
    throw new ExtractionFailure(
      'PROCESSING_ERROR',
      'This video is too long. The maximum video length is 30 seconds.',
    );
  }

  // Ensure the first frame is decoded before drawing/seeking.
  if (video.readyState < 2) {
    await waitForEvent(
      video,
      'loadeddata',
      new ExtractionFailure('PROCESSING_ERROR', 'Could not read the video data.'),
    );
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new ExtractionFailure('PROCESSING_ERROR', 'Could not read the video dimensions.');
  }

  // Scale so the shorter side is >= 640 px (upscaling smaller videos).
  const scale = Math.max(1, MIN_SHORT_SIDE_PX / Math.min(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new ExtractionFailure('PROCESSING_ERROR', 'Could not prepare the image canvas.');
  }

  const timestamps = computeFrameTimestamps(duration);
  const frames: Blob[] = [];
  for (const t of timestamps) {
    if (isCancelled()) throw new ExtractionFailure('TIMEOUT', 'Extraction was cancelled.');
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(await canvasToJpeg(canvas));
  }
  return { frames, timestamps };
}

/**
 * Extract representative JPEG frames from a video in the browser.
 * Never throws; failures are returned as a `FrameExtractionError`.
 */
export async function extractFrames(
  videoFile: File,
): Promise<FrameExtractionResult | FrameExtractionError> {
  let url: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let video: HTMLVideoElement | null = null;

  try {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    url = URL.createObjectURL(videoFile);

    const timeout = new Promise<FrameExtractionError>((resolve) => {
      timer = setTimeout(() => {
        cancelled = true;
        resolve({
          code: 'TIMEOUT',
          message: 'Extracting frames took too long (over 15 seconds). Please try again.',
        });
      }, TIMEOUT_MS);
    });

    return await Promise.race([runExtraction(video, url, () => cancelled), timeout]);
  } catch (err: unknown) {
    cancelled = true;
    if (err instanceof ExtractionFailure) {
      return { code: err.code, message: err.message };
    }
    return {
      code: 'PROCESSING_ERROR',
      message: 'Something went wrong while processing the video.',
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // best-effort release
      }
    }
    if (url) URL.revokeObjectURL(url);
  }
}
