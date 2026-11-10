import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { computeFrameTimestamps, extractFrames } from '@/lib/frameExtractor';
import type { FrameExtractionResult } from '@/lib/frameExtractor';

// Feature: intake-and-triage, Property 6: Frame count for standard-length videos
// **Validates: Requirements 3.1**

const TOLERANCE = 1e-9;

const durationArb = fc.double({ min: 3, max: 30, noNaN: true });

function expectEvenlySpaced(timestamps: number[]): void {
  const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  for (const g of gaps) {
    expect(Math.abs(g - gaps[0])).toBeLessThan(TOLERANCE);
  }
}

describe('Property 6: Frame count for standard-length videos (pure)', () => {
  it('computeFrameTimestamps returns 3-5 strictly increasing, evenly spaced timestamps inside (0, d)', () => {
    fc.assert(
      fc.property(durationArb, (d) => {
        const ts = computeFrameTimestamps(d);
        expect(ts.length).toBeGreaterThanOrEqual(3);
        expect(ts.length).toBeLessThanOrEqual(5);
        for (let i = 0; i < ts.length; i++) {
          expect(ts[i]).toBeGreaterThan(0);
          expect(ts[i]).toBeLessThan(d);
          if (i > 0) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
        }
        expectEvenlySpaced(ts);
      }),
      { numRuns: 200 },
    );
  });
});

interface FakeEnv {
  seekTargets: number[];
  canvases: { width: number; height: number }[];
}

class FakeVideo extends EventTarget {
  muted = false;
  playsInline = false;
  preload = '';
  readyState = 4;
  private _time = 0;

  constructor(
    public duration: number,
    public videoWidth: number,
    public videoHeight: number,
    private env: FakeEnv,
  ) {
    super();
  }

  set src(_value: string) {
    setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0);
  }

  get currentTime(): number {
    return this._time;
  }

  set currentTime(value: number) {
    this.env.seekTargets.push(value);
    this._time = value;
    setTimeout(() => this.dispatchEvent(new Event('seeked')), 0);
  }

  pause(): void {}
  removeAttribute(): void {}
  load(): void {}
}

describe('Property 6: Frame count for standard-length videos (extractFrames, mocked DOM)', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('returns 3-5 evenly distributed frames with seeks inside the video and canvas short side >= 640', async () => {
    await fc.assert(
      fc.asyncProperty(
        durationArb,
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        async (duration, width, height) => {
          const env: FakeEnv = { seekTargets: [], canvases: [] };
          const realCreate = document.createElement.bind(document);
          const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
            if (tag === 'video') {
              return new FakeVideo(duration, width, height, env) as unknown as HTMLVideoElement;
            }
            if (tag === 'canvas') {
              const canvas = {
                width: 0,
                height: 0,
                getContext: () => ({ drawImage: () => {} }),
                toBlob: (cb: BlobCallback) => cb(new Blob(['x'], { type: 'image/jpeg' })),
              };
              env.canvases.push(canvas);
              return canvas as unknown as HTMLCanvasElement;
            }
            return realCreate(tag);
          }) as typeof document.createElement);

          try {
            const result = await extractFrames(new File(['x'], 'v.mp4', { type: 'video/mp4' }));
            expect('frames' in result).toBe(true);
            const { frames, timestamps } = result as FrameExtractionResult;

            expect(frames.length).toBeGreaterThanOrEqual(3);
            expect(frames.length).toBeLessThanOrEqual(5);
            expect(frames.length).toBe(timestamps.length);
            for (const t of timestamps) {
              expect(t).toBeGreaterThan(0);
              expect(t).toBeLessThan(duration);
            }
            expectEvenlySpaced(timestamps);

            expect(env.seekTargets.length).toBe(frames.length);
            for (const s of env.seekTargets) {
              expect(s).toBeGreaterThanOrEqual(0);
              expect(s).toBeLessThan(duration);
            }

            expect(env.canvases.length).toBe(1);
            const c = env.canvases[0];
            expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(640);
          } finally {
            spy.mockRestore();
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
