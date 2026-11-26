'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { STICKY_PANEL } from '@/components/ui/styles';
import { shouldStick, STICKY_TOP_OFFSET_PX } from '@/lib/layout/stickyFits';

export interface StickyPanel<T extends HTMLElement> {
  /** Attach to the panel element. */
  ref: RefObject<T | null>;
  /** True when the whole panel plus the top offset fits in the window. */
  sticky: boolean;
  /** STICKY_PANEL when `sticky`, otherwise an empty string. */
  className: string;
}

/**
 * Shared by every Sticky_Panel (Home, Results, Pro job).
 * Measures the panel and the window in the browser, and re-checks when the window is resized
 * or the panel's own size changes (ResizeObserver). The panel element must stay mounted.
 *
 * SSR-safe: the first render is not sticky (no window access); the real value is set in an effect.
 * No state loop: sticky positioning does not change the panel's height, and setState with an
 * unchanged boolean does nothing. Observers and listeners are removed on unmount.
 */
export function useStickyPanel<T extends HTMLElement = HTMLElement>(
  topOffset: number = STICKY_TOP_OFFSET_PX,
): StickyPanel<T> {
  const ref = useRef<T | null>(null);
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;

    const check = () => {
      setSticky(
        shouldStick({
          panelHeight: panel.getBoundingClientRect().height,
          topOffset,
          viewportHeight: window.innerHeight,
        }),
      );
    };

    check();
    window.addEventListener('resize', check);
    // jsdom and very old browsers have no ResizeObserver; the window listener still works.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
    observer?.observe(panel);

    return () => {
      window.removeEventListener('resize', check);
      observer?.disconnect();
    };
  }, [topOffset]);

  return { ref, sticky, className: sticky ? STICKY_PANEL : '' };
}
