import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, storeTheme } from './theme';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove('theme-haunted');
});

describe('theme helpers', () => {
  it('adds and removes the theme-haunted class', () => {
    applyTheme('haunted');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(true);
    applyTheme('normal');
    expect(document.documentElement.classList.contains('theme-haunted')).toBe(false);
  });

  it('persists and reads the theme', () => {
    storeTheme('haunted');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('haunted');
    expect(readStoredTheme()).toBe('haunted');
  });

  it('falls back to normal for missing or invalid values', () => {
    expect(readStoredTheme()).toBe('normal');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'spooky');
    expect(readStoredTheme()).toBe('normal');
  });

  it('ignores storage errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStoredTheme()).toBe('normal');
    expect(() => storeTheme('haunted')).not.toThrow();
  });
});
