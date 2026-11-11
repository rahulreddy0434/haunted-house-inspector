/**
 * Pure, framework-free validation for the upload selection (Requirement 1).
 * No DOM access and no AWS calls, so it is safe to call from tests and server code.
 */

export const ACCEPTED_IMAGE_TYPES: ReadonlyArray<string> = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPTED_VIDEO_TYPES: ReadonlyArray<string> = ['video/mp4', 'video/webm'];
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 10_485_760;
export const MAX_VIDEO_SECONDS = 30;

export type UploadErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_MANY_IMAGES'
  | 'MIXED_MEDIA'
  | 'VIDEO_TOO_LONG'
  | 'TOO_MANY_VIDEOS'
  | 'FILE_TOO_LARGE'
  | 'EXTRACTION_FAILED'
  | 'EXTRACTION_TIMEOUT';

export interface UploadValidationError {
  code: UploadErrorCode;
  message: string;
  affectedFiles?: string[];
}

export type AcceptedFiles =
  | { kind: 'images'; files: File[] } // 1–5 JPEG/PNG/WebP
  | { kind: 'frames'; files: File[] }; // 1–5 extracted JPEG frames (from video)

export interface SelectedFileInfo {
  name: string;
  type: string;
  size: number;
  /** Optional; used with name and size to detect duplicate picks. */
  lastModified?: number;
}

const UNSUPPORTED_TYPE_MESSAGE =
  'That file type is not supported. Please choose JPEG, PNG or WebP photos, or an MP4 or WebM video.';
const MIXED_MEDIA_MESSAGE = 'Please choose either photos or one video, not both.';
const TOO_MANY_VIDEOS_MESSAGE = 'Only one video may be submitted. Please choose a single video.';
const TOO_MANY_IMAGES_MESSAGE = `The maximum is ${MAX_IMAGES} photos per submission. Please remove the extra photos.`;
const fileTooLargeMessage = (names: string) =>
  `${names} is larger than the 10 MB limit for each photo. Please choose a smaller photo.`;

/**
 * Check the synchronous rules in order and return the FIRST failing rule as a
 * single-element array. An empty array means the selection is valid.
 *
 * Order: unsupported type, mixed media, multiple videos, image count, image size.
 * Videos have no size cap; video duration is checked separately.
 */
export function validateSelection(files: ReadonlyArray<SelectedFileInfo>): UploadValidationError[] {
  const isImage = (f: SelectedFileInfo) => ACCEPTED_IMAGE_TYPES.includes(f.type);
  const isVideo = (f: SelectedFileInfo) => ACCEPTED_VIDEO_TYPES.includes(f.type);

  const unsupported = files.filter((f) => !isImage(f) && !isVideo(f));
  if (unsupported.length > 0) {
    return [
      {
        code: 'UNSUPPORTED_TYPE',
        message: UNSUPPORTED_TYPE_MESSAGE,
        affectedFiles: unsupported.map((f) => f.name),
      },
    ];
  }

  const images = files.filter(isImage);
  const videos = files.filter(isVideo);

  if (images.length > 0 && videos.length > 0) {
    return [
      {
        code: 'MIXED_MEDIA',
        message: MIXED_MEDIA_MESSAGE,
        affectedFiles: files.map((f) => f.name),
      },
    ];
  }

  if (videos.length > 1) {
    return [
      {
        code: 'TOO_MANY_VIDEOS',
        message: TOO_MANY_VIDEOS_MESSAGE,
        affectedFiles: videos.slice(1).map((f) => f.name),
      },
    ];
  }

  if (images.length > MAX_IMAGES) {
    return [
      {
        code: 'TOO_MANY_IMAGES',
        message: TOO_MANY_IMAGES_MESSAGE,
        affectedFiles: images.slice(MAX_IMAGES).map((f) => f.name),
      },
    ];
  }

  const tooLarge = images.filter((f) => f.size > MAX_IMAGE_BYTES);
  if (tooLarge.length > 0) {
    const names = tooLarge.map((f) => f.name).join(', ');
    return [
      {
        code: 'FILE_TOO_LARGE',
        message: fileTooLargeMessage(names),
        affectedFiles: tooLarge.map((f) => f.name),
      },
    ];
  }

  return [];
}

/** Returns an error iff the video is longer than 30 seconds. */
export function validateVideoDuration(durationSeconds: number): UploadValidationError | null {
  if (durationSeconds > MAX_VIDEO_SECONDS) {
    return {
      code: 'VIDEO_TOO_LONG',
      message: `That video is too long. The maximum video length is ${MAX_VIDEO_SECONDS} seconds.`,
    };
  }
  return null;
}

/** The current selection as seen by mergeSelection: photos ('images') or one 'video'. */
export interface CurrentSelection<T extends SelectedFileInfo = SelectedFileInfo> {
  kind: 'images' | 'video';
  files: T[];
}

export interface MergeSelectionResult<T extends SelectedFileInfo = SelectedFileInfo> {
  /** The resulting selection (the current files unchanged when the pick is rejected). */
  files: T[];
  /** Kind of `files`; null when the selection is empty. */
  kind: 'images' | 'video' | null;
  /** Validation errors for the pick. Only TOO_MANY_IMAGES can accompany accepted=true. */
  errors: UploadValidationError[];
  /** True when the incoming pick was merged (including the TOO_MANY_IMAGES truncation case). */
  accepted: boolean;
}

const fileKey = (f: SelectedFileInfo) => `${f.name}\u0000${f.size}\u0000${f.lastModified ?? 0}`;

/**
 * Pure, additive merge of an incoming pick into the current selection.
 *
 * 1. The pick is validated on its own: unsupported type, photos + video, several videos.
 * 2. Merge rules: photos vs video conflicts are rejected (MIXED_MEDIA) regardless of the
 *    individual file's validity; then incoming photo sizes (> 10 MB) are checked.
 * 3. A video replaces a
 *    video; photos are de-duplicated by (name, size, lastModified), appended in order and
 *    truncated to 5 (TOO_MANY_IMAGES is reported while the first 5 are still accepted).
 *
 * Any error other than TOO_MANY_IMAGES rejects the whole pick and leaves the current
 * selection unchanged. Video duration is checked separately by the caller.
 */
export function mergeSelection<T extends SelectedFileInfo>(
  current: CurrentSelection<T> | null,
  incoming: ReadonlyArray<T>,
): MergeSelectionResult<T> {
  const currentFiles = current ? current.files : [];
  const currentKind = current && current.files.length > 0 ? current.kind : null;
  const reject = (error: UploadValidationError): MergeSelectionResult<T> => ({
    files: currentFiles,
    kind: currentKind,
    errors: [error],
    accepted: false,
  });

  if (incoming.length === 0) {
    return { files: currentFiles, kind: currentKind, errors: [], accepted: true };
  }

  // Incoming pick on its own (unsupported type, mixed media, multiple videos).
  // validateSelection checks these three first; count/size errors are handled below.
  const pickError = validateSelection(incoming).find(
    (e) => e.code === 'UNSUPPORTED_TYPE' || e.code === 'MIXED_MEDIA' || e.code === 'TOO_MANY_VIDEOS',
  );
  if (pickError) return reject(pickError);

  const incomingImages = incoming.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
  const incomingIsVideo = incoming.length > 0 && incomingImages.length === 0;

  if (incomingIsVideo) {
    if (currentKind === 'images') {
      return reject({
        code: 'MIXED_MEDIA',
        message: MIXED_MEDIA_MESSAGE,
        affectedFiles: [...currentFiles, ...incoming].map((f) => f.name),
      });
    }
    // No selection or a current video: the new video becomes the selection.
    return { files: [...incoming], kind: 'video', errors: [], accepted: true };
  }

  // Incoming photos.
  if (currentKind === 'video') {
    return reject({
      code: 'MIXED_MEDIA',
      message: MIXED_MEDIA_MESSAGE,
      affectedFiles: [...currentFiles, ...incoming].map((f) => f.name),
    });
  }

  // Size check on the incoming photos, after the mixed-media checks, before merging.
  const tooLarge = incomingImages.filter((f) => f.size > MAX_IMAGE_BYTES);
  if (tooLarge.length > 0) {
    return reject({
      code: 'FILE_TOO_LARGE',
      message: fileTooLargeMessage(tooLarge.map((f) => f.name).join(', ')),
      affectedFiles: tooLarge.map((f) => f.name),
    });
  }

  const seen = new Set(currentFiles.map(fileKey));
  const merged: T[] = [...currentFiles];
  for (const f of incomingImages) {
    const key = fileKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(f);
  }

  if (merged.length > MAX_IMAGES) {
    return {
      files: merged.slice(0, MAX_IMAGES),
      kind: 'images',
      errors: [
        {
          code: 'TOO_MANY_IMAGES',
          message: TOO_MANY_IMAGES_MESSAGE,
          affectedFiles: merged.slice(MAX_IMAGES).map((f) => f.name),
        },
      ],
      accepted: true,
    };
  }

  return { files: merged, kind: merged.length > 0 ? 'images' : null, errors: [], accepted: true };
}
