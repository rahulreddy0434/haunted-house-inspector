import fc from 'fast-check';
import { DURATION_OPTIONS, EXTRAS_OPTIONS, LOCATION_OPTIONS } from '@/lib/intake/options';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import type { IntakeChoices } from '@/types/intake';

/** Longest free text the arbitraries produce (the spec asks for about 2,000). */
export const MAX_ARBITRARY_TEXT_LENGTH = 2000;

const TRICKY_PIECES = [
  '\u200B', // zero-width space
  '\u200C',
  '\u200D',
  '\u2060',
  '\uFEFF',
  '\u00AD', // soft hyphen
  '\t',
  '\n',
  '\r\n',
  '\u0000',
  ' ',
  '😀',
  '🔥',
  '👨‍👩‍👧', // emoji with zero-width joiners
  'é',
  '日本語',
  '.',
  '!',
  '?',
] as const;

/** Text mixing ordinary words with zero-width characters, tabs, newlines and emoji. */
const arbTrickyText = fc
  .array(
    fc.oneof(
      fc.constantFrom(...TRICKY_PIECES),
      fc.string({ maxLength: 12 }),
      fc.fullUnicodeString({ maxLength: 6 }),
    ),
    { maxLength: 400 },
  )
  .map((parts) => parts.join('').slice(0, MAX_ARBITRARY_TEXT_LENGTH));

/** Free text of up to about 2,000 characters, in several flavours. */
export const arbFreeText: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.string({ maxLength: 200 }) },
  { weight: 2, arbitrary: fc.fullUnicodeString({ maxLength: 200 }) },
  { weight: 3, arbitrary: arbTrickyText },
  {
    weight: 1,
    arbitrary: fc
      .string({ minLength: 1, maxLength: 20 })
      .chain((unit) =>
        fc
          .integer({ min: 1500, max: MAX_ARBITRARY_TEXT_LENGTH })
          .map((n) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n)),
      ),
  },
);

/** Valid choices built from the real option lists. Lists keep canonical order. */
export const arbIntakeChoices: fc.Arbitrary<IntakeChoices> = fc.record({
  safety: fc.subarray(SAFETY_CHIPS.map((c) => c.id)),
  location: fc.option(fc.constantFrom(...LOCATION_OPTIONS), { nil: null }),
  placeText: arbFreeText,
  duration: fc.option(fc.constantFrom(...DURATION_OPTIONS), { nil: null }),
  extras: fc.subarray([...EXTRAS_OPTIONS]),
  somethingElseText: arbFreeText,
});
