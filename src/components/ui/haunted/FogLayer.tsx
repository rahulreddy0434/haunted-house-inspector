'use client';

import { useTheme } from '@/components/ThemeProvider';
import { ArtBoundary } from '@/components/ui/haunted/ArtBoundary';

/** Slow fog along the bottom of the viewport. Renders nothing unless the effective theme is Haunted. */
export function FogLayer() {
  const { effective } = useTheme();
  if (effective !== 'haunted') return null;
  return (
    <ArtBoundary>
      <div
        data-haunted-art="fog"
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[20vh] max-h-[25vh] overflow-hidden"
      >
        <svg
          focusable="false"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="hhi-fog-drift pointer-events-none h-full w-[200%] text-haunted-fog opacity-30"
        >
          <path
            fill="currentColor"
            d="M0 70 C80 40 160 40 240 65 C320 90 400 90 480 60 C560 30 640 35 720 62 C800 90 880 88 960 58 C1040 30 1120 40 1200 70 L1200 120 L0 120 Z"
          />
          <path
            fill="currentColor"
            d="M0 95 C100 75 200 78 300 95 C400 112 500 110 600 92 C700 74 800 78 900 96 C1000 112 1100 108 1200 95 L1200 120 L0 120 Z"
          />
        </svg>
      </div>
    </ArtBoundary>
  );
}
