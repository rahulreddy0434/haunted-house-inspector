// Feature: intake-and-triage, Property 5: Image file size constraint
// **Validates: Requirements 1.8**
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSelection } from './mediaValidation';

const LIMIT = 10_485_760;
const imageType = fc.constantFrom('image/jpeg', 'image/png', 'image/webp');
const videoType = fc.constantFrom('video/mp4', 'video/webm');

describe('Property 5: Image file size constraint', () => {
  it('accepts a single image iff size <= 10 MB, else one FILE_TOO_LARGE error naming the file', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000_000 }), imageType, (size, type) => {
        const name = 'photo.img';
        const errors = validateSelection([{ name, type, size }]);
        if (size <= LIMIT) {
          expect(errors).toEqual([]);
        } else {
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('FILE_TOO_LARGE');
          expect(errors[0].affectedFiles).toContain(name);
          expect(errors[0].message).toContain(name);
          expect(errors[0].message).toContain('10 MB');
        }
      }),
    );
  });

  it('handles the exact boundary', () => {
    expect(validateSelection([{ name: 'a.jpg', type: 'image/jpeg', size: 10_485_760 }])).toEqual([]);
    const errors = validateSelection([{ name: 'a.jpg', type: 'image/jpeg', size: 10_485_761 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('FILE_TOO_LARGE');
  });

  it('never rejects a video for size', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600_000_000 }), videoType, (size, type) => {
        expect(validateSelection([{ name: 'clip.mp4', type, size }])).toEqual([]);
      }),
    );
    expect(validateSelection([{ name: 'big.mp4', type: 'video/mp4', size: 500_000_000 }])).toEqual([]);
    expect(validateSelection([{ name: 'big.webm', type: 'video/webm', size: 500_000_000 }])).toEqual([]);
  });

  it('lists only the oversized images among several', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20_000_000 }), { minLength: 1, maxLength: 5 }), (sizes) => {
        const files = sizes.map((size, i) => ({ name: `p${i}.png`, type: 'image/png', size }));
        const expected = files.filter((f) => f.size > LIMIT).map((f) => f.name);
        const errors = validateSelection(files);
        if (expected.length === 0) {
          expect(errors).toEqual([]);
        } else {
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('FILE_TOO_LARGE');
          expect(errors[0].affectedFiles).toEqual(expected);
        }
      }),
    );
  });
});
