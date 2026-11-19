import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mapTrade } from '@/lib/haunted/tradeMapper';

const RUNS = { numRuns: 200 };

const whitespace = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u2003'), {
  maxLength: 5,
});
const blankString = whitespace;
const nonBlankString = fc
  .tuple(whitespace, fc.fullUnicodeString({ minLength: 1, maxLength: 40 }), whitespace)
  .map(([a, b, c]) => a + b + c)
  .filter((s) => s.trim() !== '');

/** Characters whose case conversion never creates or destroys an ASCII keyword letter. */
const safeChar = fc.oneof(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ-'.split('')),
  fc.constantFrom('日', '本', '🙂', '5', '_'),
);
const safeText = fc.stringOf(safeChar, { maxLength: 30 });

const GHOSTS = ['Poltergeist', 'Wraith', 'Banshee', 'Ghoul', 'Restless spirit'];

describe('tradeMapper properties', () => {
  // Feature: haunted-mode, Property 1: Ghost label carries the real trade
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.12, 17.1**
  it('Property 1: label contains the trimmed real trade; blank gives null', () => {
    fc.assert(
      fc.property(nonBlankString, (t) => {
        const result = mapTrade(t);
        expect(result).not.toBeNull();
        const label = result!.label;
        expect(label).toBe(`${result!.ghostName} (${result!.tradeDisplayText})`);
        expect(GHOSTS).toContain(result!.ghostName);
        expect(label.toLowerCase()).toContain(t.trim().toLowerCase());
      }),
      RUNS,
    );
    fc.assert(
      fc.property(blankString, (t) => {
        expect(mapTrade(t)).toBeNull();
      }),
      RUNS,
    );
  });

  // Feature: haunted-mode, Property 2: Trade mapping is deterministic and case-insensitive
  // **Validates: Requirements 6.6, 6.11, 17.2**
  it('Property 2: deterministic and case-insensitive', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 40 }), (t) => {
        expect(mapTrade(t)).toEqual(mapTrade(t));
      }),
      RUNS,
    );
    fc.assert(
      fc.property(safeText, (t) => {
        const base = mapTrade(t);
        for (const variant of [t.toUpperCase(), t.toLowerCase()]) {
          const other = mapTrade(variant);
          expect(other?.category).toBe(base?.category);
          expect(other?.ghostName).toBe(base?.ghostName);
        }
      }),
      RUNS,
    );
  });

  it('Property 2: each category keyword maps to its ghost name, in any case', () => {
    const cases: Array<[string, string]> = [
      ['plumb', 'Poltergeist'],
      ['electric', 'Wraith'],
      ['hvac', 'Banshee'],
      ['heating', 'Banshee'],
      ['cooling', 'Banshee'],
      ['furnace', 'Banshee'],
      ['boiler', 'Banshee'],
      ['air condition', 'Banshee'],
      ['mould', 'Ghoul'],
      ['mold', 'Ghoul'],
      ['damp', 'Ghoul'],
      ['moisture', 'Ghoul'],
    ];
    // Only keywords of later categories may appear alongside; earlier ones never do.
    const earlier: Record<string, string[]> = {
      Poltergeist: [],
      Wraith: ['plumb'],
      Banshee: ['plumb', 'electric'],
      Ghoul: ['plumb', 'electric', 'hvac', 'heating', 'cooling', 'furnace', 'boiler', 'air condition'],
    };
    fc.assert(
      fc.property(
        fc.constantFrom(...cases),
        safeText,
        safeText,
        fc.constantFrom('lower', 'upper', 'mixed'),
        ([keyword, ghost], pre, post, mode) => {
          const raw = `${pre}${keyword}${post}`;
          fc.pre(!earlier[ghost].some((k) => raw.toLowerCase().includes(k)));
          const text = mode === 'lower' ? raw.toLowerCase() : mode === 'upper' ? raw.toUpperCase() : raw;
          expect(mapTrade(text)?.ghostName).toBe(ghost);
        },
      ),
      RUNS,
    );
  });

  it('Property 2: non-blank text with no keyword is "Restless spirit"', () => {
    const keywords = ['plumb', 'electric', 'hvac', 'heating', 'cooling', 'furnace', 'boiler',
      'air condition', 'mould', 'mold', 'damp', 'moisture'];
    fc.assert(
      fc.property(safeText, (t) => {
        fc.pre(t.trim() !== '');
        fc.pre(!keywords.some((k) => t.toLowerCase().includes(k)));
        expect(mapTrade(t)?.ghostName).toBe('Restless spirit');
        expect(mapTrade(t)?.category).toBe('Other');
      }),
      RUNS,
    );
  });
});

describe('tradeMapper examples', () => {
  // **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 17.15**
  it.each([
    ['plumber', 'Poltergeist (Plumber)'],
    ['electrician', 'Wraith (Electrician)'],
    ['hvac technician', 'Banshee (HVAC technician)'],
    ['damp specialist', 'Ghoul (Damp specialist)'],
    ['chimney sweep', 'Restless spirit (Chimney sweep)'],
    ['central hvac tech', 'Banshee (Central hvac tech)'],
  ])('maps %s to %s', (input, label) => {
    expect(mapTrade(input)?.label).toBe(label);
  });

  it.each([[''], ['   '], ['\t\n'], [undefined], [null], [42], [{}]])(
    'returns null for blank or non-string input %o',
    (input) => {
      expect(mapTrade(input as unknown as string)).toBeNull();
    },
  );
});
