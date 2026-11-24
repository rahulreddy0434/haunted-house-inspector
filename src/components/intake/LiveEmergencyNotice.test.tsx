// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LiveEmergencyNotice } from '@/components/intake/LiveEmergencyNotice';
import { EMERGENCY_MESSAGE } from '@/lib/emergency/messages';

/** The alert's text with the decorative aria-hidden warning glyph left out. */
function messageText(alert: HTMLElement): string {
  const clone = alert.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

const ROOT = document.documentElement;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  ROOT.classList.remove('theme-haunted');
});

describe('LiveEmergencyNotice', () => {
  it('renders exactly the Emergency_Message with role="alert" when active', () => {
    render(<LiveEmergencyNotice active />);
    const alert = screen.getByRole('alert');
    expect(messageText(alert)).toBe(EMERGENCY_MESSAGE);
  });

  it('has no haunted: class token anywhere in its subtree', () => {
    ROOT.classList.add('theme-haunted');
    const { container } = render(<LiveEmergencyNotice active />);
    const all = [container, ...Array.from(container.querySelectorAll('*'))];
    for (const el of all) {
      expect(Array.from(el.classList).some((c) => c.startsWith('haunted:'))).toBe(false);
    }
  });

  it('shows the same text and keeps role="alert" after theme toggles', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <LiveEmergencyNotice active />
      </ThemeProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Haunted mode' });
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(toggle);
      expect(messageText(screen.getByRole('alert'))).toBe(EMERGENCY_MESSAGE);
    }
  });

  it('renders nothing when inactive', () => {
    const { container } = render(<LiveEmergencyNotice active={false} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
