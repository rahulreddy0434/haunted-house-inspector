import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from './ThemeProvider';
import { EmergencyScope } from '@/components/ui/haunted/EmergencyScope';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove('theme-haunted');
});

describe('ThemeToggle', () => {
  it('toggles the html class, aria-pressed and storage', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    const button = screen.getByRole('button', { name: 'Haunted theme' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toBe('Haunted mode: Off');

    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('Haunted mode: On');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(true);
    expect(window.localStorage.getItem('hhi_theme')).toBe('haunted');

    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(false);
    expect(window.localStorage.getItem('hhi_theme')).toBe('normal');
  });

  it('restores the stored theme on mount', () => {
    window.localStorage.setItem('hhi_theme', 'haunted');
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(true);
  });

  it('is absent while an EmergencyScope is mounted and present again after it unmounts', () => {
    window.localStorage.setItem('hhi_theme', 'haunted');
    function Page({ emergency }: { emergency: boolean }) {
      return (
        <ThemeProvider>
          <ThemeToggle />
          {emergency ? <EmergencyScope /> : null}
        </ThemeProvider>
      );
    }
    const { rerender } = render(<Page emergency />);
    expect(screen.queryByText(/Haunted mode/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(window.localStorage.getItem('hhi_theme')).toBe('haunted');
    rerender(<Page emergency={false} />);
    const button = screen.getByRole('button', { name: 'Haunted theme' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(true);
  });
});
