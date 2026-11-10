import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  validateSelection,
  type SelectedFileInfo,
} from './mediaValidation';

// Feature: intake-and-triage, Property 2: Mixed-media submissions are always rejected
// **Validates: Requirements 1.3**

const imageFile = (prefix: string): fc.Arbitrary<SelectedFileInfo> =>
  fc.record({
    name: fc.nat({ max: 999 }).map((n) => `${prefix}-${n}.img`),
    type: fc.constantFrom(...ACCEPTED_IMAGE_TYPES),
    size: fc.integer({ min: 1, max: 1_000_000 }),
  });

const videoFile = (prefix: string): fc.Arbitrary<SelectedFileInfo> =>
  fc.record({
    name: fc.nat({ max: 999 }).map((n) => `${prefix}-${n}.vid`),
    type: fc.constantFrom(...ACCEPTED_VIDEO_TYPES),
    size: fc.integer({ min: 1, max: 1_000_000 }),
  });

/** Randomly interleave the two lists into one list. */
const interleave = (
  a: SelectedFileInfo[],
  b: SelectedFileInfo[],
): fc.Arbitrary<SelectedFileInfo[]> =>
  fc.shuffledSubarray([...a, ...b], { minLength: a.length + b.length });

const MIXED_MESSAGE = /photos or one video, not both/;

describe('Property 2: Mixed-media submissions are always rejected', () => {
  it('images + one video in any order yields exactly one MIXED_MEDIA error', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.array(imageFile('i'), { minLength: 1, maxLength: 5 }),
            fc.array(videoFile('v'), { minLength: 1, maxLength: 1 }),
          )
          .chain(([imgs, vids]) => interleave(imgs, vids)),
        (files) => {
          const errors = validateSelection(files);
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('MIXED_MEDIA');
          expect(errors[0].message).toMatch(MIXED_MESSAGE);
        },
      ),
    );
  });

  it('MIXED_MEDIA takes precedence over TOO_MANY_VIDEOS, TOO_MANY_IMAGES and FILE_TOO_LARGE', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.array(imageFile('i'), { minLength: 1, maxLength: 8 }),
            fc.array(videoFile('v'), { minLength: 1, maxLength: 4 }),
            fc.integer({ min: MAX_IMAGE_BYTES + 1, max: MAX_IMAGE_BYTES * 2 }),
          )
          .chain(([imgs, vids, big]) =>
            interleave([{ ...imgs[0], size: big }, ...imgs.slice(1)], vids),
          ),
        (files) => {
          const errors = validateSelection(files);
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('MIXED_MEDIA');
          expect(errors[0].message).toMatch(MIXED_MESSAGE);
        },
      ),
    );
  });

  it('an unsupported type combined with mixed media yields UNSUPPORTED_TYPE first', () => {
    const badFile: fc.Arbitrary<SelectedFileInfo> = fc.record({
      name: fc.nat({ max: 999 }).map((n) => `bad-${n}.bin`),
      type: fc.constantFrom('application/pdf', 'image/gif', 'video/avi', 'text/plain', ''),
      size: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.array(imageFile('i'), { minLength: 1, maxLength: 5 }),
            fc.array(videoFile('v'), { minLength: 1, maxLength: 2 }),
            badFile,
          )
          .chain(([imgs, vids, bad]) => interleave(imgs, [...vids, bad])),
        (files) => {
          const errors = validateSelection(files);
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('UNSUPPORTED_TYPE');
        },
      ),
    );
  });

  it('control: only images or only a single video is never MIXED_MEDIA', () => {
    fc.assert(
      fc.property(fc.array(imageFile('i'), { minLength: 1, maxLength: 5 }), (images) => {
        expect(validateSelection(images).map((e) => e.code)).not.toContain('MIXED_MEDIA');
      }),
    );
    fc.assert(
      fc.property(fc.array(videoFile('v'), { minLength: 1, maxLength: 1 }), (videos) => {
        expect(validateSelection(videos).map((e) => e.code)).not.toContain('MIXED_MEDIA');
      }),
    );
  });
});
