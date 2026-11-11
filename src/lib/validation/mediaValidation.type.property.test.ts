// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateSelection, mergeSelection } from './mediaValidation';
import type { CurrentSelection, SelectedFileInfo } from './mediaValidation';

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

// ---- Additive: mergeSelection (incremental picks) ----

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const NEAR_MISSES = ['image/jpg', 'IMAGE/JPEG', 'image/gif', 'video/quicktime', 'application/pdf', '', 'image/jpeg ', 'video/mp4;codecs=avc1'];
const badType = fc.oneof(unsupportedType, fc.constantFrom(...NEAR_MISSES));

const photo = (i: number, type: string = 'image/jpeg'): SelectedFileInfo => ({
  name: `cur-${i}.img`,
  type,
  size: SMALL,
  lastModified: i,
});
const currentArb: fc.Arbitrary<CurrentSelection | null> = fc.oneof(
  fc.constant(null),
  fc
    .tuple(fc.integer({ min: 1, max: 5 }), fc.constantFrom(...IMAGE_TYPES))
    .map(([n, t]) => ({ kind: 'images' as const, files: Array.from({ length: n }, (_, i) => photo(i, t)) })),
  fc
    .constantFrom(...(['video/mp4', 'video/webm'] as const))
    .map((t) => ({ kind: 'video' as const, files: [{ name: 'cur.vid', type: t, size: SMALL, lastModified: 1 }] })),
);

describe('Property 1: file type validation via mergeSelection', () => {
  it('rejects any pick containing a non-allowed type, leaving the current selection unchanged', () => {
    const picks = fc.tuple(
      fc.array(fc.constantFrom(...IMAGE_TYPES), { maxLength: 3 }),
      badType,
      fc.nat(3),
    );
    fc.assert(
      fc.property(currentArb, picks, (current, [okTypes, bad, pos]) => {
        const incoming: SelectedFileInfo[] = okTypes.map((type, i) => ({
          name: `in-${i}.img`,
          type,
          size: SMALL,
          lastModified: 100 + i,
        }));
        incoming.splice(Math.min(pos, incoming.length), 0, {
          name: 'bad-file',
          type: bad,
          size: SMALL,
          lastModified: 7,
        });
        const result = mergeSelection(current, incoming);
        expect(result.accepted).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('UNSUPPORTED_TYPE');
        expect(result.errors[0].affectedFiles).toContain('bad-file');
        expect(result.files).toEqual(current ? current.files : []);
        expect(result.kind).toBe(current ? current.kind : null);
      }),
      { numRuns: 100 },
    );
  });

  it.each(NEAR_MISSES)('rejects near-miss type %j onto every kind of current selection', (type) => {
    const currents: Array<CurrentSelection | null> = [
      null,
      { kind: 'images', files: [photo(0), photo(1)] },
      { kind: 'video', files: [{ name: 'v', type: 'video/mp4', size: SMALL }] },
    ];
    for (const current of currents) {
      const result = mergeSelection(current, [{ name: 'f', type, size: SMALL }]);
      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('UNSUPPORTED_TYPE');
      expect(result.errors[0].affectedFiles).toContain('f');
      expect(result.files).toEqual(current ? current.files : []);
    }
  });

  it('accepts photos of allowed types onto null or existing photos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.constantFrom(...IMAGE_TYPES), { minLength: 1, maxLength: 5 }),
        (curCount, types) => {
          const current: CurrentSelection | null =
            curCount === 0 ? null : { kind: 'images', files: Array.from({ length: curCount }, (_, i) => photo(i)) };
          const incoming = types.map((type, i) => ({ name: `in-${i}.img`, type, size: SMALL, lastModified: 100 + i }));
          const result = mergeSelection(current, incoming);
          expect(result.accepted).toBe(true);
          expect(result.errors.some((e) => e.code === 'UNSUPPORTED_TYPE')).toBe(false);
          expect(result.kind).toBe('images');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts one allowed video onto an empty selection', () => {
    fc.assert(
      fc.property(fc.constantFrom('video/mp4', 'video/webm'), fileName, (type, name) => {
        const result = mergeSelection(null, [{ name, type, size: SMALL }]);
        expect(result.accepted).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.kind).toBe('video');
        expect(result.files).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });
});
