import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { contrastRatio, minimumFor } from './contrast';
import { resolveColour } from './palette';
import { CONTRAST_REGISTRY, formatFailure } from './contrastRegistry';

const hexColour = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join(''));

describe('contrast registry properties', () => {
  // Feature: haunted-mode, Property 7: Every registered colour pair meets its minimum
  // **Validates: Requirements 3.7, 4.1, 4.3, 4.4, 4.5, 4.8, 9.8, 11.5, 17.4**
  it('every registered pair meets the minimum for its role', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CONTRAST_REGISTRY), (pair) => {
        const ratio = contrastRatio(resolveColour(pair.fg), resolveColour(pair.bg));
        const minimum = minimumFor(pair.role);
        if (ratio < minimum) {
          throw new Error(formatFailure({ pair, ratio, minimum }));
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });

  // Feature: haunted-mode, Property 7: Every registered colour pair meets its minimum
  // **Validates: Requirements 3.7, 4.1, 4.3, 4.4, 4.5, 4.8, 9.8, 11.5, 17.4**
  it('contains the emergency banner and badge pairs for both themes', () => {
    for (const theme of ['normal', 'haunted'] as const) {
      for (const id of ['F-01', 'F-02', 'F-03', 'F-04']) {
        expect(
          CONTRAST_REGISTRY.some((p) => p.id === id && p.theme === theme),
          `${id} missing for ${theme}`,
        ).toBe(true);
      }
    }
  });

  // Feature: haunted-mode, Property 8: Contrast ratio is a well-formed measure
  // **Validates: Requirements 4.3, 4.4, 4.7**
  it('contrast ratio is symmetric, within 1 to 21, and 1 for equal colours', () => {
    fc.assert(
      fc.property(hexColour, hexColour, (a, b) => {
        const ab = contrastRatio(a, b);
        expect(ab).toBe(contrastRatio(b, a));
        expect(ab).toBeGreaterThanOrEqual(1);
        expect(ab).toBeLessThanOrEqual(21 + 1e-9);
        expect(contrastRatio(a, a)).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
