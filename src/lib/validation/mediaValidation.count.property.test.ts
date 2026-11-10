import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  validateSelection,
  type SelectedFileInfo,
} from './mediaValidation';

// Feature: intake-and-triage, Property 3: Image count constraint
// **Validates: Requirements 1.2**

const imageFiles = (min: number, max: number) =>
  fc
    .array(
      fc.record({
        type: fc.constantFrom(...ACCEPTED_IMAGE_TYPES),
        size: fc.integer({ min: 1, max: 1024 }),
      }),
      { minLength: min, maxLength: max },
    )
    .map((items): SelectedFileInfo[] => items.map((it, i) => ({ name: `photo-${i}.img`, ...it })));

describe('Property 3: Image count constraint', () => {
  it('accepts iff count <= 5; otherwise exactly one TOO_MANY_IMAGES error', () => {
    fc.assert(
      fc.property(imageFiles(1, 20), (files) => {
        const errors = validateSelection(files);
        if (files.length <= MAX_IMAGES) {
          expect(errors).toEqual([]);
        } else {
          expect(errors).toHaveLength(1);
          expect(errors[0].code).toBe('TOO_MANY_IMAGES');
          expect(errors[0].message).toContain('maximum is 5 photos');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('boundary: 5 images are accepted, 6 are rejected', () => {
    const make = (n: number): SelectedFileInfo[] =>
      Array.from({ length: n }, (_, i) => ({ name: `p${i}.jpg`, type: 'image/jpeg', size: 100 }));
    expect(validateSelection(make(5))).toEqual([]);
    const errors = validateSelection(make(6));
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('TOO_MANY_IMAGES');
  });

  it('count is checked before size when both rules fail', () => {
    fc.assert(
      fc.property(imageFiles(6, 20), fc.nat(), (files, idx) => {
        const i = idx % files.length;
        const withBig = files.map((f, j) => (j === i ? { ...f, size: MAX_IMAGE_BYTES + 1 } : f));
        const errors = validateSelection(withBig);
        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('TOO_MANY_IMAGES');
      }),
      { numRuns: 100 },
    );
  });
});
