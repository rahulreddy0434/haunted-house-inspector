import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { shouldStick, STICKY_TOP_OFFSET_PX } from '@/lib/layout/stickyFits';

// Validates: Requirement 17.9

describe('shouldStick', () => {
  it('sticks when the panel and offset fit with room to spare', () => {
    expect(shouldStick({ panelHeight: 600, topOffset: 16, viewportHeight: 900 })).toBe(true);
  });

  it('sticks at the boundary, where panel height plus offset equals the window height', () => {
    expect(shouldStick({ panelHeight: 884, topOffset: 16, viewportHeight: 900 })).toBe(true);
  });

  it('does not stick when the panel is one pixel too tall', () => {
    expect(shouldStick({ panelHeight: 885, topOffset: 16, viewportHeight: 900 })).toBe(false);
  });

  it('does not stick for zero, negative or non-finite inputs', () => {
    expect(shouldStick({ panelHeight: 0, topOffset: 16, viewportHeight: 900 })).toBe(false);
    expect(shouldStick({ panelHeight: 500, topOffset: 16, viewportHeight: 0 })).toBe(false);
    expect(shouldStick({ panelHeight: -5, topOffset: 16, viewportHeight: 900 })).toBe(false);
    expect(shouldStick({ panelHeight: NaN, topOffset: 16, viewportHeight: 900 })).toBe(false);
    expect(shouldStick({ panelHeight: 500, topOffset: NaN, viewportHeight: 900 })).toBe(false);
    expect(shouldStick({ panelHeight: 500, topOffset: 16, viewportHeight: NaN })).toBe(false);
    expect(shouldStick({ panelHeight: Infinity, topOffset: 16, viewportHeight: Infinity })).toBe(false);
  });

  it('uses a 16 px offset, matching top-4', () => {
    expect(STICKY_TOP_OFFSET_PX).toBe(16);
  });

  it('property: result equals the sum check for finite positive numbers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 1, max: 5000 }),
        (panelHeight, topOffset, viewportHeight) =>
          shouldStick({ panelHeight, topOffset, viewportHeight }) ===
          panelHeight + topOffset <= viewportHeight,
      ),
    );
  });
});
