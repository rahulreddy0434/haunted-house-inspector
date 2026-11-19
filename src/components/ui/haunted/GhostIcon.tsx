'use client';

import { useTheme } from '@/components/ThemeProvider';

/** Small decorative ghost. Renders nothing unless the effective theme is Haunted. */
export function GhostIcon({ className = '' }: { className?: string }) {
  const { effective } = useTheme();
  if (effective !== 'haunted') return null;
  return (
    <svg
      data-haunted-art="ghost"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className={`pointer-events-none inline-block h-4 w-4 shrink-0 align-text-bottom ${className}`.trim()}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 1.5a5 5 0 0 0-5 5v7.2c0 .5.6.8 1 .4l1-1 1.1 1.1a.7.7 0 0 0 1 0L8 13.1l.9 1.1a.7.7 0 0 0 1 0l1.1-1.1 1 1c.4.4 1 .1 1-.4V6.5a5 5 0 0 0-5-5ZM6 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
      />
    </svg>
  );
}
