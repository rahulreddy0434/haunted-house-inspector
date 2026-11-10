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
}

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
        message:
          'That file type is not supported. Please choose JPEG, PNG or WebP photos, or an MP4 or WebM video.',
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
        message: 'Please choose either photos or one video, not both.',
        affectedFiles: files.map((f) => f.name),
      },
    ];
  }

  if (videos.length > 1) {
    return [
      {
        code: 'TOO_MANY_VIDEOS',
        message: 'Only one video may be submitted. Please choose a single video.',
        affectedFiles: videos.slice(1).map((f) => f.name),
      },
    ];
  }

  if (images.length > MAX_IMAGES) {
    return [
      {
        code: 'TOO_MANY_IMAGES',
        message: `The maximum is ${MAX_IMAGES} photos per submission. Please remove the extra photos.`,
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
        message: `${names} is larger than the 10 MB limit for each photo. Please choose a smaller photo.`,
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
