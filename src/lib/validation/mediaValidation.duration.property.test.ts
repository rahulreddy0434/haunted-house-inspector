import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateVideoDuration } from './mediaValidation';

// Feature: intake-and-triage, Property 4: Video duration constraint
// **Validates: Requirements 1.4**
describe('Property 4: Video duration constraint', () => {
  it('accepts a duration iff it is at most 30 seconds', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 60, noNaN: true }), (d) => {
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
});
