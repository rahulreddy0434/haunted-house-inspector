import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/lib/utils/formatCurrency';

describe('formatCurrency', () => {
  it('formats whole CAD amounts with the CA$ prefix', () => {
    expect(formatCurrency(1200)).toBe('CA$1,200');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('CA$0');
  });

  it('rounds to whole dollars', () => {
    expect(formatCurrency(1234.56)).toBe('CA$1,235');
  });
});
