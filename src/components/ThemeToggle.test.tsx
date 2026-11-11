import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove('theme-haunted');
});

describe('ThemeToggle', () => {
  it('toggles the html class, aria-pressed and storage', () => {
    render(<ThemeToggle />);
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
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(true);
  });
});
