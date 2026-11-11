// Feature: intake-and-triage, Property 5: Image file size constraint
// **Validates: Requirements 1.8**
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSelection, mergeSelection, type CurrentSelection, type SelectedFileInfo } from './mediaValidation';

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

describe('Property 5 (mergeSelection): whole pick rejected when an image is too large', () => {
  const sizeArb = fc.integer({ min: 0, max: 20_000_000 });
  const validSizeArb = fc.integer({ min: 0, max: LIMIT });
  const bigSizeArb = fc.integer({ min: LIMIT + 1, max: 20_000_000 });

  const currentArb = fc.oneof(
    fc.constant<CurrentSelection | null>(null),
    fc
      .array(fc.tuple(validSizeArb, imageType), { minLength: 1, maxLength: 4 })
      .map<CurrentSelection | null>((items) => ({
        kind: 'images',
        files: items.map(([size, type], i) => ({ name: `cur${i}.img`, type, size, lastModified: i })),
      })),
  );

  it('rejects the entire pick, names the oversized files, and leaves the current selection unchanged', () => {
    fc.assert(
      fc.property(
        currentArb,
        fc.array(fc.tuple(sizeArb, imageType), { minLength: 1, maxLength: 5 }),
        bigSizeArb,
        fc.nat(),
        (current, items, bigSize, pos) => {
          const incoming: SelectedFileInfo[] = items.map(([size, type], i) => ({
            name: `new${i}.img`,
            type,
            size,
            lastModified: 100 + i,
          }));
          // Guarantee at least one oversized image at an arbitrary position.
          const idx = pos % incoming.length;
          incoming[idx] = { ...incoming[idx], size: bigSize };

          const oversized = incoming.filter((f) => f.size > LIMIT).map((f) => f.name);
          const before = current ? current.files.map((f) => ({ ...f })) : [];

          const result = mergeSelection(current, incoming);

          expect(result.accepted).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe('FILE_TOO_LARGE');
          expect(result.errors[0].affectedFiles).toEqual(oversized);
          for (const name of oversized) expect(result.errors[0].message).toContain(name);
          expect(result.errors[0].message).toContain('10 MB');
          expect(result.files).toEqual(before);
          // Valid photos in the same pick are not added.
          for (const f of incoming) expect(result.files.map((x) => x.name)).not.toContain(f.name);
        },
      ),
    );
  });

  it('accepts images of exactly 10_485_760 bytes, and sizes up to the limit', () => {
    const exact = { name: 'edge.jpg', type: 'image/jpeg', size: LIMIT };
    const result = mergeSelection(null, [exact]);
    expect(result.accepted).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.files).toEqual([exact]);

    fc.assert(
      fc.property(currentArb, fc.array(fc.tuple(validSizeArb, imageType), { minLength: 1, maxLength: 1 }), (current, items) => {
        const incoming = items.map(([size, type], i) => ({ name: `new${i}.img`, type, size, lastModified: 100 + i }));
        const result = mergeSelection(current, incoming);
        expect(result.accepted).toBe(true);
        expect(result.errors.some((e) => e.code === 'FILE_TOO_LARGE')).toBe(false);
      }),
    );
  });

  it('never rejects a video for size (first pick, and replacing a video)', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, videoType, videoType, (s1, s2, t1, t2) => {
        const first = { name: 'a.mp4', type: t1, size: s1, lastModified: 1 };
        const r1 = mergeSelection(null, [first]);
        expect(r1.accepted).toBe(true);
        expect(r1.errors).toEqual([]);
        expect(r1.files).toEqual([first]);

        const second = { name: 'b.mp4', type: t2, size: s2, lastModified: 2 };
        const current: CurrentSelection = { kind: 'video', files: [first] };
        const r2 = mergeSelection(current, [second]);
        expect(r2.accepted).toBe(true);
        expect(r2.errors).toEqual([]);
        expect(r2.files).toEqual([second]);
      }),
    );
  });
});
