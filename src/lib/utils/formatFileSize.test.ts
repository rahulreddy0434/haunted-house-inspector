import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatFileSize } from './formatFileSize';

describe('formatFileSize', () => {
  it('shows MB with one decimal', () => {
    expect(formatFileSize(0)).toBe('0.0 MB');
    expect(formatFileSize(1_048_576)).toBe('1.0 MB');
    expect(formatFileSize(2_516_582)).toBe('2.4 MB');
    expect(formatFileSize(10_485_760)).toBe('10.0 MB');
  });

  it('always ends in " MB" with exactly one decimal digit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50_000_000 }), (n) => {
        expect(formatFileSize(n)).toMatch(/^\d+\.\d MB$/);
      }),
    );
  });
});
