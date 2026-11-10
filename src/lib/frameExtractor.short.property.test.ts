import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  computeFrameTimestamps,
  extractFrames,
  type FrameExtractionError,
  type FrameExtractionResult,
} from '@/lib/frameExtractor';

// Feature: intake-and-triage, Property 7: Frame count for short videos
// **Validates: Requirements 3.6**

const shortDuration = fc.double({ min: 0.001, max: 2.999, noNaN: true });

function expectedTimestamps(d: number): number[] {
  if (d < 1) return [0];
  return Array.from({ length: Math.floor(d) }, (_, i) => i + 1);
}

/** Minimal fake <video> built on EventTarget. */
function makeFakeVideo(duration: number, width: number, height: number) {
  const target = new EventTarget();
  let currentTime = 0;
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    muted: false,
    playsInline: false,
    preload: '',
    duration,
    videoWidth: width,
    videoHeight: height,
    readyState: 4,
    set src(_value: string) {
      setTimeout(() => target.dispatchEvent(new Event('loadedmetadata')), 0);
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(value: number) {
      currentTime = value;
      setTimeout(() => target.dispatchEvent(new Event('seeked')), 0);
    },
    pause: () => undefined,
    removeAttribute: () => undefined,
    load: () => undefined,
  };
}

function makeFakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => undefined }),
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'], { type: 'image/jpeg' })),
  };
}

describe('Property 7: Frame count for short videos', () => {
  describe('computeFrameTimestamps (pure)', () => {
    it('returns max(1, floor(d)) timestamps following the short-video rule', () => {
      fc.assert(
        fc.property(shortDuration, (d) => {
          const ts = computeFrameTimestamps(d);
          expect(ts).toHaveLength(Math.max(1, Math.floor(d)));
          if (d < 1) expect(ts).toEqual([0]);
          expect(ts).toEqual(expectedTimestamps(d));
        }),
        { numRuns: 100 },
      );
    });

    it('handles explicit examples', () => {
      expect(computeFrameTimestamps(0.5)).toEqual([0]);
      expect(computeFrameTimestamps(1)).toEqual([1]);
      expect(computeFrameTimestamps(2.999)).toEqual([1, 2]);
    });
  });

  describe('extractFrames (mocked DOM)', () => {
    const realCreateElement = document.createElement.bind(document);
    let currentVideo: ReturnType<typeof makeFakeVideo>;

    beforeEach(() => {
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        if (tag === 'video') return currentVideo;
        if (tag === 'canvas') return makeFakeCanvas();
        return realCreateElement(tag);
      }) as typeof document.createElement);
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function run(d: number, w = 1280, h = 720) {
      currentVideo = makeFakeVideo(d, w, h);
      const result = await extractFrames(new File(['v'], 'v.mp4', { type: 'video/mp4' }));
      expect((result as FrameExtractionError).code).toBeUndefined();
      return result as FrameExtractionResult;
    }

    it('returns the expected frames for any short duration', async () => {
      await fc.assert(
        fc.asyncProperty(
          shortDuration,
          fc.integer({ min: 100, max: 4000 }),
          fc.integer({ min: 100, max: 4000 }),
          async (d, w, h) => {
            const result = await run(d, w, h);
            expect(result.frames).toHaveLength(Math.max(1, Math.floor(d)));
            expect(result.timestamps).toEqual(expectedTimestamps(d));
            expect(result.frames).toHaveLength(result.timestamps.length);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('handles explicit examples', async () => {
      expect((await run(0.5)).timestamps).toEqual([0]);
      expect((await run(0.5)).frames).toHaveLength(1);
      expect((await run(1)).timestamps).toEqual([1]);
      expect((await run(2.999)).timestamps).toEqual([1, 2]);
    });
  });
});
