'use client';

import { useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('normal');

  // Restore the stored choice after mount (the inline head script already applied the class).
  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const haunted = theme === 'haunted';

  function toggle() {
    const next: Theme = haunted ? 'normal' : 'haunted';
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <button
      type="button"
      aria-pressed={haunted}
      aria-label="Haunted theme"
      onClick={toggle}
      className="rounded-full border border-gray-400 px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 haunted:border-haunted-border haunted:text-haunted-text haunted:hover:bg-haunted-surface haunted:focus-visible:ring-haunted-accent"
    >
      Haunted mode: {haunted ? 'On' : 'Off'}
    </button>
  );
}
