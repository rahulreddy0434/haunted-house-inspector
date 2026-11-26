/**
 * Sticky_Panel decision, kept pure so it can be tested without a browser.
 *
 * A panel may stick only when the whole panel plus its top offset fits in the window.
 * Otherwise it scrolls with the page and is shown whole (no inner scroll box).
 */

/** Gap above a sticky panel in px. Must match `top-4` (1rem) in STICKY_PANEL (ui/styles.ts). */
export const STICKY_TOP_OFFSET_PX = 16;

export interface StickyInput {
  panelHeight: number;
  topOffset: number;
  viewportHeight: number;
}

/**
 * True when `panelHeight + topOffset <= viewportHeight`.
 * Non-finite values, a panel height of 0 or less (not rendered or hidden) and a viewport
 * height of 0 or less all give false, so the panel falls back to normal scrolling.
 */
export function shouldStick({ panelHeight, topOffset, viewportHeight }: StickyInput): boolean {
  if (!Number.isFinite(panelHeight) || !Number.isFinite(topOffset) || !Number.isFinite(viewportHeight)) {
    return false;
  }
  if (panelHeight <= 0 || viewportHeight <= 0 || topOffset < 0) return false;
  return panelHeight + topOffset <= viewportHeight;
}
