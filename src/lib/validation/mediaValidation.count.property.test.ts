import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  mergeSelection,
  validateSelection,
  type SelectedFileInfo,
} from './mediaValidation';

// Feature: intake-and-triage, Property 3: Image count constraint
// **Validates: Requirements 1.2, 1.9, 1.10**

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

// Additive photo picks folded through mergeSelection.
const key = (f: SelectedFileInfo) => [f.name, f.size, f.lastModified].join('|');

const photo = fc.record({
  name: fc.constantFrom('a.jpg', 'b.jpg', 'c.png', 'd.png', 'e.webp', 'f.webp', 'g.jpg', 'h.jpg'),
  type: fc.constantFrom(...ACCEPTED_IMAGE_TYPES),
  size: fc.integer({ min: 1, max: 2 }),
  lastModified: fc.integer({ min: 0, max: 1 }),
});
const picks = fc.array(fc.array(photo, { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 8 });

describe('Property 3: additive photo picks via mergeSelection', () => {
  it('keeps min(5, d) distinct photos in first-appearance order and reports TOO_MANY_IMAGES on overflow', () => {
    fc.assert(
      fc.property(picks, (sequence) => {
        let files: SelectedFileInfo[] = [];
        const firstSeen: SelectedFileInfo[] = [];
        const seenKeys = new Set<string>();
        for (const pick of sequence) {
          const before = new Set(files.map(key));
          const distinctAfter = new Set([...before, ...pick.map(key)]).size;
          for (const f of pick) {
            if (!seenKeys.has(key(f))) {
              seenKeys.add(key(f));
              firstSeen.push(f);
            }
          }
          const res = mergeSelection(files.length ? { kind: 'images', files } : null, pick);
          expect(res.accepted).toBe(true);
          expect(res.files.length).toBeLessThanOrEqual(MAX_IMAGES);
          if (distinctAfter > MAX_IMAGES) {
            expect(res.errors).toHaveLength(1);
            expect(res.errors[0].code).toBe('TOO_MANY_IMAGES');
            expect(res.errors[0].message).toContain('maximum is 5 photos');
            expect(res.files).toHaveLength(MAX_IMAGES);
          } else {
            expect(res.errors.some((e) => e.code === 'TOO_MANY_IMAGES')).toBe(false);
            expect(res.files).toHaveLength(distinctAfter);
          }
          files = res.files;
        }
        expect(files.map(key)).toEqual(firstSeen.slice(0, MAX_IMAGES).map(key));
        expect(files).toHaveLength(Math.min(MAX_IMAGES, seenKeys.size));
      }),
      { numRuns: 200 },
    );
  });

  it('examples: 4 + 1 ok, 5 + 1 stays 5 with error, 3 + 4 keeps existing 3 then first 2 new', () => {
    const mk = (names: string[]): SelectedFileInfo[] =>
      names.map((name) => ({ name, type: 'image/jpeg', size: 1, lastModified: 0 }));
    const names = (fs: SelectedFileInfo[]) => fs.map((f) => f.name);

    const ok = mergeSelection({ kind: 'images', files: mk(['1', '2', '3', '4']) }, mk(['5']));
    expect(ok.errors).toEqual([]);
    expect(names(ok.files)).toEqual(['1', '2', '3', '4', '5']);

    const over = mergeSelection({ kind: 'images', files: mk(['1', '2', '3', '4', '5']) }, mk(['6']));
    expect(over.accepted).toBe(true);
    expect(over.errors[0].code).toBe('TOO_MANY_IMAGES');
    expect(names(over.files)).toEqual(['1', '2', '3', '4', '5']);

    const mixed = mergeSelection({ kind: 'images', files: mk(['1', '2', '3']) }, mk(['4', '5', '6', '7']));
    expect(mixed.errors[0].code).toBe('TOO_MANY_IMAGES');
    expect(names(mixed.files)).toEqual(['1', '2', '3', '4', '5']);
  });
});
