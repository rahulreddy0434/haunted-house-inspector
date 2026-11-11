// @vitest-environment node
// Feature: intake-and-triage, Property 23: Additive selection is order-preserving and duplicate-free
// **Validates: Requirements 1.9, 1.10, 1.11**
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  MAX_IMAGES,
  mergeSelection,
  type CurrentSelection,
  type MergeSelectionResult,
  type SelectedFileInfo,
} from './mediaValidation';

// Small pools so duplicates occur often. lastModified undefined is equivalent to 0.
const photo = fc.record({
  name: fc.constantFrom('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'),
  type: fc.constant('image/jpeg'),
  size: fc.constantFrom(100, 200),
  lastModified: fc.constantFrom<number | undefined>(undefined, 0, 1),
}) as fc.Arbitrary<SelectedFileInfo>;

const pick = fc.array(photo, { maxLength: 8 });
const picks = fc.array(pick, { maxLength: 6 });

const key = (f: SelectedFileInfo) => `${f.name}|${f.size}|${f.lastModified ?? 0}`;

/** Build a reachable current selection by applying picks one after another. */
function applyAll(sequence: SelectedFileInfo[][]): CurrentSelection | null {
  let current: CurrentSelection | null = null;
  for (const p of sequence) {
    const r: MergeSelectionResult = mergeSelection(current, p);
    current = r.files.length > 0 ? { kind: 'images', files: r.files } : null;
  }
  return current;
}

describe('Property 23: additive selection is order-preserving and duplicate-free', () => {
  it('never contains two files with the same (name, size, lastModified ?? 0)', () => {
    fc.assert(
      fc.property(picks, (sequence) => {
        let current: CurrentSelection | null = null;
        for (const p of sequence) {
          const r: MergeSelectionResult = mergeSelection(current, p);
          const keys = r.files.map(key);
          expect(new Set(keys).size).toBe(keys.length);
          expect(r.files.length).toBeLessThanOrEqual(MAX_IMAGES);
          current = r.files.length > 0 ? { kind: 'images', files: r.files } : null;
        }
      }),
    );
  });

  it('is idempotent: repeating a pick changes nothing and reports no new error', () => {
    fc.assert(
      fc.property(picks, pick, (sequence, p) => {
        const current = applyAll(sequence);
        const once = mergeSelection(current, p);
        fc.pre(once.errors.length === 0); // truncation legitimately re-reports on repeat
        const next: CurrentSelection | null =
          once.files.length > 0 ? { kind: 'images', files: once.files } : null;
        const twice = mergeSelection(next, p);
        expect(twice.files.map(key)).toEqual(once.files.map(key));
        expect(twice.accepted).toBe(true);
        expect(twice.errors).toEqual([]);
      }),
    );
  });

  it('preserves existing order/position and appends new items in first-appearance order (with truncation)', () => {
    fc.assert(
      fc.property(picks, pick, (sequence, p) => {
        const current = applyAll(sequence);
        const existing = current ? current.files : [];
        const r = mergeSelection(current, p);

        const seen = new Set(existing.map(key));
        const expectedNew: SelectedFileInfo[] = [];
        for (const f of p) {
          if (!seen.has(key(f))) {
            seen.add(key(f));
            expectedNew.push(f);
          }
        }
        const expected = [...existing, ...expectedNew].slice(0, MAX_IMAGES);

        expect(r.accepted).toBe(true);
        expect(r.files.map(key)).toEqual(expected.map(key));
        existing.forEach((f, i) => expect(r.files[i]).toBe(f));
        const overflow = existing.length + expectedNew.length > MAX_IMAGES;
        expect(r.errors.map((e) => e.code)).toEqual(overflow ? ['TOO_MANY_IMAGES'] : []);
      }),
    );
  });

  it('a pick of only already-selected photos changes nothing and reports no error', () => {
    fc.assert(
      fc.property(
        picks,
        fc.array(fc.nat(), { maxLength: 8 }),
        (sequence, indexes) => {
          const current = applyAll(sequence);
          fc.pre(current !== null);
          const files = current!.files;
          const p = indexes.map((i) => files[i % files.length]);
          const r = mergeSelection(current, p);
          expect(r.accepted).toBe(true);
          expect(r.errors).toEqual([]);
          expect(r.files.map(key)).toEqual(files.map(key));
        },
      ),
    );
  });

  it('a rejected pick leaves the list unchanged and a later valid pick still works', () => {
    fc.assert(
      fc.property(picks, pick, pick, fc.nat(), (sequence, badBase, later, at) => {
        const current = applyAll(sequence);
        const bad = [...badBase];
        bad.splice(at % (bad.length + 1), 0, { name: 'x.gif', type: 'image/gif', size: 1 });

        const rejected = mergeSelection(current, bad);
        expect(rejected.accepted).toBe(false);
        expect(rejected.errors[0].code).toBe('UNSUPPORTED_TYPE');
        expect(rejected.files).toEqual(current ? current.files : []);

        const afterRejected = rejected.files.length > 0 ? { kind: 'images' as const, files: rejected.files } : null;
        const viaRejected = mergeSelection(afterRejected, later);
        const direct = mergeSelection(current, later);
        expect(viaRejected.accepted).toBe(true);
        expect(viaRejected.files.map(key)).toEqual(direct.files.map(key));
      }),
    );
  });

  it('same name but different size or lastModified is not a duplicate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('a.jpg', 'b.jpg'),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (name, size, lm, dSize, dLm) => {
          const base: SelectedFileInfo = { name, type: 'image/png', size, lastModified: lm };
          const diffSize = { ...base, size: size + dSize };
          const diffLm = { ...base, lastModified: lm + dLm };
          const r = mergeSelection({ kind: 'images', files: [base] }, [diffSize, diffLm]);
          expect(r.errors).toEqual([]);
          expect(r.files).toEqual([base, diffSize, diffLm]);
        },
      ),
    );
  });
});
