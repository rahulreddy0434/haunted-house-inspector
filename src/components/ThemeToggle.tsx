'use client';

import { useTheme } from '@/components/ThemeProvider';
import type { Theme } from '@/lib/theme';

export function ThemeToggle() {
  const { setting, setSetting, inEmergency } = useTheme();

  // Hidden on an Emergency_Page: absent from the DOM, no replacement text.
  if (inEmergency) return null;

  const haunted = setting === 'haunted';

  function toggle() {
    const next: Theme = haunted ? 'normal' : 'haunted';
    setSetting(next);
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
