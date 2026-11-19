'use client';

import { useTheme } from '@/components/ThemeProvider';
import { ArtBoundary } from '@/components/ui/haunted/ArtBoundary';

/** Decorative cobweb for a card's top-right corner. Renders nothing unless the effective theme is Haunted. */
export function Cobweb() {
  const { effective } = useTheme();
  if (effective !== 'haunted') return null;
  return (
    <ArtBoundary>
      <svg
        data-haunted-art="cobweb"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 56 56"
        className="pointer-events-none absolute right-0 top-0 -z-10 h-14 w-14 text-haunted-border opacity-30"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M56 0 L0 0" />
          <path d="M56 0 L0 18" />
          <path d="M56 0 L10 44" />
          <path d="M56 0 L30 56" />
          <path d="M56 0 L56 56" />
          <path d="M44 0 Q42 12 56 14" />
          <path d="M30 0 Q28 20 56 28" />
          <path d="M16 3 Q18 28 56 42" />
        </g>
        <circle cx="30" cy="27" r="1.6" fill="currentColor" />
        <path d="M30 28.6 L30 38" stroke="currentColor" strokeWidth="0.8" fill="none" />
      </svg>
    </ArtBoundary>
  );
}
