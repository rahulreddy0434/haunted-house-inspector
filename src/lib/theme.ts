export type Theme = 'normal' | 'haunted';

export const THEME_STORAGE_KEY = 'hhi_theme';
export const HAUNTED_CLASS = 'theme-haunted';

/** Applies the theme class to the root element. Safe to call without a DOM. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(HAUNTED_CLASS, theme === 'haunted');
}

/** Reads the stored theme. Falls back to 'normal' on missing/invalid values or storage errors. */
export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'haunted' ? 'haunted' : 'normal';
  } catch {
    return 'normal';
  }
}

/** Persists the theme. Storage errors are ignored. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode, quota); the theme just won't persist.
  }
}
