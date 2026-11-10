// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateSelection } from './mediaValidation';

// Feature: intake-and-triage, Property 1: File type validation rejects exactly the non-allowed MIME types
// **Validates: Requirements 1.1**

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'] as const;
const SMALL = 1024;

const unsupportedType = fc.string().filter((s) => !(ALLOWED as readonly string[]).includes(s));
const fileName = fc.string({ minLength: 1, maxLength: 30 });

describe('Property 1: file type validation', () => {
  it('(a) rejects any non-allowed MIME type with a single UNSUPPORTED_TYPE error', () => {
    fc.assert(
      fc.property(fileName, unsupportedType, (name, type) => {
        const result = validateSelection([{ name, type, size: SMALL }]);
        expect(result).toHaveLength(1);
        expect(result[0].code).toBe('UNSUPPORTED_TYPE');
        expect(result[0].affectedFiles).toContain(name);
      }),
      { numRuns: 100 },
    );
  });

  it('(b) accepts each allowed MIME type', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALLOWED), fileName, (type, name) => {
        expect(validateSelection([{ name, type, size: SMALL }])).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('(c) reports UNSUPPORTED_TYPE first in a mixed selection and lists accepted formats', () => {
    const allowedImage = fc.constantFrom('image/jpeg', 'image/png', 'image/webp');
    fc.assert(
      fc.property(
        fc.array(allowedImage, { minLength: 1, maxLength: 4 }),
        unsupportedType,
        (imageTypes, badType) => {
          const files = [
            ...imageTypes.map((type, i) => ({ name: `ok-${i}.img`, type, size: SMALL })),
            { name: 'bad-file', type: badType, size: SMALL },
          ];
          const result = validateSelection(files);
          expect(result).toHaveLength(1);
          expect(result[0].code).toBe('UNSUPPORTED_TYPE');
          expect(result[0].affectedFiles).toEqual(['bad-file']);
          for (const label of ['JPEG', 'PNG', 'WebP', 'MP4', 'WebM']) {
            expect(result[0].message).toContain(label);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it.each(['image/jpg', 'IMAGE/JPEG', 'image/gif', 'video/quicktime', 'application/pdf', ''])(
    'rejects near-miss type %j',
    (type) => {
      const result = validateSelection([{ name: 'f', type, size: SMALL }]);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('UNSUPPORTED_TYPE');
      expect(result[0].affectedFiles).toContain('f');
    },
  );
});
