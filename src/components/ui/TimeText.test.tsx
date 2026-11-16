import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimeText } from './TimeText';

describe('TimeText', () => {
  it('renders a time element whose dateTime equals the UTC input', () => {
    const iso = '2026-03-05T20:00:00.000Z';
    const { container } = render(<TimeText iso={iso} className="x" />);
    const el = container.querySelector('time');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('datetime')).toBe(iso);
    expect(el?.className).toBe('x');
    expect(el?.textContent).toContain('2026');
    expect(el?.textContent).toMatch(/\b(?:[A-Z]{2,5}|GMT[+-]\d+|UTC)\s*$/);
  });

  it.each(['not-a-date', ''])('renders the raw string for invalid input %j', (iso) => {
    const { container } = render(<TimeText iso={iso} />);
    const el = container.querySelector('time');
    expect(el?.textContent).toBe(iso);
    expect(el?.getAttribute('datetime')).toBe(iso);
  });
});
