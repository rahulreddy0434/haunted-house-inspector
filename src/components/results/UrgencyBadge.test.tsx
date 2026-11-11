import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UrgencyBadge } from './UrgencyBadge';
import { urgencyLabel } from '@/lib/utils/urgencyLabel';
import type { UrgencyLevel } from '@/types/inspection';

afterEach(cleanup);

const CASES: Array<{ level: UrgencyLevel; label: string; hue: RegExp }> = [
  { level: 'emergency', label: 'Emergency', hue: /red-/ },
  { level: 'urgent', label: 'Urgent — act today', hue: /orange-/ },
  { level: 'soon', label: 'Soon — within a week', hue: /yellow-/ },
  { level: 'monitor', label: 'Monitor — keep an eye on it', hue: /green-/ },
];

function classesOf(level: UrgencyLevel): string[] {
  const { container, unmount } = render(<UrgencyBadge urgency={level} />);
  const root = container.firstElementChild as HTMLElement;
  const classes = Array.from(root.classList);
  unmount();
  return classes;
}

describe('UrgencyBadge', () => {
  describe.each(CASES)('$level', ({ level, label, hue }) => {
    it('renders the exact label text', () => {
      render(<UrgencyBadge urgency={level} />);
      expect(screen.getByText(label, { exact: true })).toBeTruthy();
    });

    it('label equals urgencyLabel(level)', () => {
      expect(urgencyLabel(level)).toBe(label);
      const { container } = render(<UrgencyBadge urgency={level} />);
      expect(container.textContent).toContain(urgencyLabel(level));
    });

    it('has the label as accessible name, excluding the aria-hidden symbol', () => {
      const { container } = render(<UrgencyBadge urgency={level} />);
      const root = container.firstElementChild as HTMLElement;
      const hidden = root.querySelector('[aria-hidden="true"]');
      expect(hidden).not.toBeNull();
      const name = Array.from(root.childNodes)
        .filter((n) => n !== hidden)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      expect(name).toBe(label);
      if (level === 'emergency') {
        // role="status" does not take its name from content, so assert the
        // role resolves to the root and its accessible text is the label.
        expect(screen.getByRole('status')).toBe(root);
      }
    });

    it('sets the matching data-urgency attribute on the root', () => {
      const { container } = render(<UrgencyBadge urgency={level} />);
      expect(container.firstElementChild?.getAttribute('data-urgency')).toBe(level);
    });

    it('uses the expected hue classes and haunted: variants', () => {
      const classes = classesOf(level);
      const normal = classes.filter((c) => !c.startsWith('haunted:'));
      const haunted = classes.filter((c) => c.startsWith('haunted:'));
      expect(normal.some((c) => hue.test(c))).toBe(true);
      expect(haunted.length).toBeGreaterThan(0);
      expect(haunted.some((c) => hue.test(c))).toBe(true);
    });
  });

  it('only emergency has role="status"', () => {
    for (const { level } of CASES) {
      const { container, unmount } = render(<UrgencyBadge urgency={level} />);
      const role = container.firstElementChild?.getAttribute('role');
      expect(role).toBe(level === 'emergency' ? 'status' : null);
      unmount();
    }
  });

  it('uses distinct colour class sets per level', () => {
    const sets = CASES.map(({ level }) =>
      classesOf(level)
        .filter((c) => /-(100|900|600|950|400)$/.test(c))
        .sort()
        .join(' '),
    );
    expect(new Set(sets).size).toBe(CASES.length);
  });
});
