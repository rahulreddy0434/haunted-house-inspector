// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { digestsEqual, isAccessCodeValid, safeEqualBuffers } from './accessCode';

// Feature: pro-dashboard-and-booking, Property 8: Access code comparison matches equality and never throws
// **Validates: Requirements 1.3, 3.7, 14.1**

const RUNS = { numRuns: 150 };

const text = fc.oneof(fc.string(), fc.fullUnicodeString(), fc.string({ minLength: 1 }));
const nonEmpty = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.fullUnicodeString({ minLength: 1 }),
);

describe('Property 8: access code comparison', () => {
  it('isAccessCodeValid(a, b) equals b !== "" && a === b', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(isAccessCodeValid(a, b)).toBe(b !== '' && a === b);
      }),
      RUNS,
    );
  });

  it('equal non-empty strings are valid; an appended character is not', () => {
    fc.assert(
      fc.property(nonEmpty, (s) => {
        expect(isAccessCodeValid(s, s)).toBe(true);
        expect(isAccessCodeValid(s, s + 'x')).toBe(false);
        expect(isAccessCodeValid(s + 'x', s)).toBe(false);
      }),
      RUNS,
    );
  });

  it('an empty expected code never matches anything, including the empty string', () => {
    expect(isAccessCodeValid('', '')).toBe(false);
    fc.assert(
      fc.property(text, (a) => {
        expect(isAccessCodeValid(a, '')).toBe(false);
      }),
      RUNS,
    );
  });

  it('digestsEqual(a, b) equals a === b', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(digestsEqual(a, b)).toBe(a === b);
      }),
      RUNS,
    );
  });

  it('safeEqualBuffers equals byte equality, including different lengths, without throwing', () => {
    const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    fc.assert(
      fc.property(fc.uint8Array(), fc.uint8Array(), (a, b) => {
        expect(safeEqualBuffers(a, b)).toBe(bytesEqual(a, b));
        expect(safeEqualBuffers(a, a.slice())).toBe(true);
      }),
      RUNS,
    );
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1 }), (a) => {
        expect(safeEqualBuffers(a, a.slice(0, a.length - 1))).toBe(false);
      }),
      RUNS,
    );
  });

  it('non-string inputs never throw and return false', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.string(), (x, y, s) => {
        const notString = (v: unknown) => typeof v !== 'string';
        if (notString(x) || notString(y)) {
          expect(isAccessCodeValid(x, y)).toBe(false);
        }
        if (notString(x)) expect(isAccessCodeValid(x, s)).toBe(false);
        if (notString(y)) expect(isAccessCodeValid(s, y)).toBe(false);
      }),
      RUNS,
    );
  });
});
