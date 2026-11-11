import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateVideoDuration,
  mergeSelection,
  type CurrentSelection,
  type MergeSelectionResult,
  type SelectedFileInfo,
  type UploadValidationError,
} from './mediaValidation';

const video = (name: string): SelectedFileInfo => ({
  name,
  type: 'video/mp4',
  size: 5_000_000,
  lastModified: 1,
});
const photo = (name: string): SelectedFileInfo => ({
  name,
  type: 'image/jpeg',
  size: 1000,
  lastModified: 1,
});

/**
 * Models the caller's rule: mergeSelection does not read durations, so the caller checks
 * validateVideoDuration first and only merges the video when it is within the limit.
 */
function acceptVideoReplacement(
  current: CurrentSelection | null,
  incomingVideo: SelectedFileInfo,
  durationSeconds: number,
): MergeSelectionResult {
  const durationError: UploadValidationError | null = validateVideoDuration(durationSeconds);
  if (durationError !== null) {
    return {
      files: current ? current.files : [],
      kind: current && current.files.length > 0 ? current.kind : null,
      errors: [durationError],
      accepted: false,
    };
  }
  return mergeSelection(current, [incomingVideo]);
}

const durationArb = fc.double({ min: 0, max: 60, noNaN: true });

// Feature: intake-and-triage, Property 4: Video duration constraint
// **Validates: Requirements 1.4, 1.14**
describe('Property 4: Video duration constraint', () => {
  it('accepts a duration iff it is at most 30 seconds', () => {
    fc.assert(
      fc.property(durationArb, (d) => {
        const result = validateVideoDuration(d);
        if (d <= 30) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect(result?.code).toBe('VIDEO_TOO_LONG');
          expect(result?.message).toContain('maximum video length is 30 seconds');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('handles boundary examples', () => {
    expect(validateVideoDuration(30)).toBeNull();
    expect(validateVideoDuration(0)).toBeNull();
    const over = validateVideoDuration(30.001);
    expect(over?.code).toBe('VIDEO_TOO_LONG');
    expect(over?.message).toContain('maximum video length is 30 seconds');
  });

  it('replacement video is accepted and replaces the current video iff d <= 30', () => {
    const current: CurrentSelection = { kind: 'video', files: [video('old.mp4')] };
    const incoming = video('new.mp4');
    fc.assert(
      fc.property(durationArb, (d) => {
        const result = acceptVideoReplacement(current, incoming, d);
        if (d <= 30) {
          expect(result.accepted).toBe(true);
          expect(result.errors).toEqual([]);
          expect(result.kind).toBe('video');
          expect(result.files).toEqual([incoming]);
        } else {
          expect(result.accepted).toBe(false);
          expect(result.files).toEqual(current.files);
          expect(result.kind).toBe('video');
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe('VIDEO_TOO_LONG');
          expect(result.errors[0].message).toContain('maximum video length is 30 seconds');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a first video (no current selection) is accepted iff d <= 30', () => {
    const incoming = video('first.mp4');
    fc.assert(
      fc.property(durationArb, (d) => {
        const result = acceptVideoReplacement(null, incoming, d);
        if (d <= 30) {
          expect(result.accepted).toBe(true);
          expect(result.kind).toBe('video');
          expect(result.files).toEqual([incoming]);
          expect(result.errors).toEqual([]);
        } else {
          expect(result.accepted).toBe(false);
          expect(result.files).toEqual([]);
          expect(result.kind).toBeNull();
          expect(result.errors[0].code).toBe('VIDEO_TOO_LONG');
          expect(result.errors[0].message).toContain('maximum video length is 30 seconds');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('with photos selected, a video of any duration is rejected as MIXED_MEDIA by mergeSelection', () => {
    const current: CurrentSelection = { kind: 'images', files: [photo('a.jpg'), photo('b.jpg')] };
    const incoming = video('clip.mp4');
    fc.assert(
      fc.property(durationArb, (d) => {
        // Only videos within the limit reach mergeSelection; mixed media is its decision.
        const merged = mergeSelection(current, [incoming]);
        expect(merged.accepted).toBe(false);
        expect(merged.errors[0].code).toBe('MIXED_MEDIA');
        expect(merged.files).toEqual(current.files);
        expect(merged.kind).toBe('images');

        const result = acceptVideoReplacement(current, incoming, d);
        expect(result.accepted).toBe(false);
        expect(result.files).toEqual(current.files);
        expect(result.kind).toBe('images');
        expect(result.errors[0].code).toBe(d <= 30 ? 'MIXED_MEDIA' : 'VIDEO_TOO_LONG');
      }),
      { numRuns: 100 },
    );
  });
});
