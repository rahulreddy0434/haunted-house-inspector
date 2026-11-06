import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatConfidence } from '@/lib/utils/formatConfidence';

describe('formatConfidence', () => {
  // Feature: intake-and-triage, Property 16: Confidence formatting always produces a tilde-prefixed percentage
  // **Validates: Requirements 9.3, 9.5**
  it('always produces ~N% where N is Math.round(c*100)', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (c) => {
        const out = formatConfidence(c);
        expect(out.startsWith('~')).toBe(true);
        expect(out.endsWith('%')).toBe(true);
        expect(Number(out.slice(1, -1))).toBe(Math.round(c * 100));
      }),
    );
  });

  it('formats examples', () => {
    expect(formatConfidence(0.755)).toBe('~76%');
    expect(formatConfidence(0)).toBe('~0%');
    expect(formatConfidence(1)).toBe('~100%');
  });
});
