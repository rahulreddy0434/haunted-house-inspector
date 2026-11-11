import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  mergeSelection,
  validateSelection,
  type SelectedFileInfo,
} from './mediaValidation';

// Feature: intake-and-triage, Property 2: Mixed-media submissions are always rejected
// **Validates: Requirements 1.3, 1.13**

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

describe('Property 2 (across picks, via mergeSelection): mixed media is always rejected', () => {
  const photoSet = (min: number, max: number) =>
    fc.array(imageFile('c'), { minLength: min, maxLength: max });
  const oneVideo = videoFile('v');
  const currentPhotos = photoSet(1, 5).map((files) => ({ kind: 'images' as const, files }));
  const currentVideo = oneVideo.map((v) => ({ kind: 'video' as const, files: [v] }));

  it('(a) photos and a video in ONE pick are rejected with MIXED_MEDIA and the current selection is unchanged', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), currentPhotos, currentVideo),
        fc
          .tuple(
            fc.array(imageFile('i'), { minLength: 1, maxLength: 5 }),
            fc.array(videoFile('n'), { minLength: 1, maxLength: 1 }),
          )
          .chain(([imgs, vids]) => interleave(imgs, vids)),
        (current, pick) => {
          const r = mergeSelection(current, pick);
          expect(r.accepted).toBe(false);
          expect(r.errors.map((e) => e.code)).toEqual(['MIXED_MEDIA']);
          expect(r.files).toEqual(current ? current.files : []);
          expect(r.kind).toBe(current ? current.kind : null);
        },
      ),
    );
  });

  it('(b) current photos + incoming video => MIXED_MEDIA, current photos unchanged', () => {
    fc.assert(
      fc.property(currentPhotos, oneVideo, (current, video) => {
        const r = mergeSelection(current, [video]);
        expect(r.accepted).toBe(false);
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0].code).toBe('MIXED_MEDIA');
        expect(r.errors[0].message).toContain('either photos or one video, not both');
        expect(r.files).toEqual(current.files);
        expect(r.kind).toBe('images');
      }),
    );
  });

  it('(c) current video + incoming photos => MIXED_MEDIA, current video unchanged', () => {
    fc.assert(
      fc.property(currentVideo, photoSet(1, 5), (current, photos) => {
        const r = mergeSelection(current, photos);
        expect(r.accepted).toBe(false);
        expect(r.errors.map((e) => e.code)).toEqual(['MIXED_MEDIA']);
        expect(r.errors[0].message).toContain('either photos or one video, not both');
        expect(r.files).toEqual(current.files);
        expect(r.kind).toBe('video');
      }),
    );
  });

  it('(d) control: a new video replaces a video without error; photos onto photos is never MIXED_MEDIA', () => {
    fc.assert(
      fc.property(currentVideo, oneVideo, (current, next) => {
        const r = mergeSelection(current, [next]);
        expect(r.accepted).toBe(true);
        expect(r.errors).toEqual([]);
        expect(r.files).toEqual([next]);
        expect(r.kind).toBe('video');
      }),
    );
    fc.assert(
      fc.property(currentPhotos, photoSet(1, 5), (current, photos) => {
        const r = mergeSelection(current, photos);
        expect(r.errors.map((e) => e.code)).not.toContain('MIXED_MEDIA');
        expect(r.kind).toBe('images');
      }),
    );
  });

  it('(e) precedence: an unsupported type in the pick wins over MIXED_MEDIA', () => {
    const bad: fc.Arbitrary<SelectedFileInfo> = fc.record({
      name: fc.nat({ max: 999 }).map((n) => `bad-${n}.bin`),
      type: fc.constantFrom('application/pdf', 'image/gif', 'video/avi', 'text/plain', ''),
      size: fc.integer({ min: 1, max: 1_000_000 }),
    });
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), currentPhotos, currentVideo),
        fc
          .tuple(
            fc.array(imageFile('i'), { minLength: 1, maxLength: 3 }),
            fc.array(videoFile('n'), { minLength: 1, maxLength: 1 }),
            bad,
          )
          .chain(([imgs, vids, b]) => interleave(imgs, [...vids, b])),
        (current, pick) => {
          const r = mergeSelection(current, pick);
          expect(r.accepted).toBe(false);
          expect(r.errors.map((e) => e.code)).toEqual(['UNSUPPORTED_TYPE']);
          expect(r.files).toEqual(current ? current.files : []);
        },
      ),
    );
    // An unsupported file against a current selection of the other kind also reports UNSUPPORTED_TYPE.
    fc.assert(
      fc.property(currentVideo, bad, (current, b) => {
        const r = mergeSelection(current, [{ name: 'p.jpg', type: 'image/jpeg', size: 1 }, b]);
        expect(r.errors.map((e) => e.code)).toEqual(['UNSUPPORTED_TYPE']);
      }),
    );
  });
});