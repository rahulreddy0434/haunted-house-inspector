'use client';

import { useTheme } from '@/components/ThemeProvider';
import { ArtBoundary } from '@/components/ui/haunted/ArtBoundary';

/** Haunted-house silhouette with a crescent moon for the page header. Renders nothing unless the effective theme is Haunted. */
export function HeaderSilhouette() {
  const { effective } = useTheme();
  if (effective !== 'haunted') return null;
  return (
    <ArtBoundary>
      <svg
        data-haunted-art="header-silhouette"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 160 48"
        className="pointer-events-none h-10 w-auto shrink-0 text-haunted-border"
      >
        {/* crescent moon */}
        <path
          className="text-haunted-muted"
          fill="currentColor"
          fillRule="evenodd"
          d="M138 6a10 10 0 1 0 8 16 8 8 0 0 1-8-16Z"
        />
        {/* house body, tower, roofs and chimney */}
        <g fill="currentColor">
          <path d="M20 46 V26 L44 14 L68 26 V46 Z" />
          <path d="M70 46 V12 L80 2 L90 12 V46 Z" />
          <path d="M68 46 V30 H100 V46 Z" />
          <path d="M98 46 V28 L112 20 L126 28 V46 Z" />
          <rect x="52" y="8" width="6" height="12" />
          <rect x="50" y="6" width="10" height="3" />
        </g>
        {/* lit windows */}
        <g className="hhi-flicker text-haunted-accent" fill="currentColor">
          <rect x="30" y="30" width="6" height="8" />
          <rect x="52" y="30" width="6" height="8" />
          <rect x="77" y="16" width="6" height="8" />
          <rect x="108" y="32" width="6" height="8" />
        </g>
      </svg>
    </ArtBoundary>
  );
}
