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
      role="switch"
      aria-checked={haunted}
      onClick={toggle}
      className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-full px-2 text-sm font-medium text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 haunted:text-haunted-text haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg"
    >
      <span>Haunted mode</span>
      <span aria-hidden="true">{haunted ? 'On' : 'Off'}</span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-11 items-center rounded-full border px-0.5 ${
          haunted
            ? 'justify-end border-haunted-accent bg-haunted-accent'
            : 'justify-start border-gray-500 bg-white haunted:border-haunted-border haunted:bg-haunted-field'
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full ${
            haunted ? 'bg-haunted-on-accent' : 'bg-gray-500 haunted:bg-haunted-muted'
          }`}
        />
      </span>
    </button>
  );
}
