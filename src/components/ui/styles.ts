/**
 * Shared Tailwind class recipes. Colour comes only from token classes, and each
 * Normal-theme colour has a `haunted:` partner. No animation or transition classes.
 */
import type { FilterChipState } from '@/lib/theme/tokens';
import type { UrgencyLevel } from '@/types/inspection';

/** Cobweb positioning, plus a reset so space-y-* adds no top margin below the Cobweb svg (Haunted only). */
export const CARD_SHELL = 'relative isolate overflow-hidden [&>svg+*]:!mt-0';
/** Card look in the Haunted theme only. Normal keeps the element's own classes. */
export const CARD_HAUNTED_ONLY =
  'haunted:relative haunted:isolate haunted:overflow-hidden haunted:rounded-lg haunted:border haunted:border-haunted-border haunted:bg-haunted-surface haunted:p-4 haunted:text-haunted-text haunted:[&>svg+*]:!mt-0';
export const CARD =
  'relative isolate overflow-hidden [&>svg+*]:!mt-0 rounded-lg border border-normal-card-border bg-normal-card p-4 text-normal-text haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text';

/** Page background and default text colour. */
export const PAGE_BG = 'bg-normal-page text-normal-text haunted:bg-haunted-bg haunted:text-haunted-text';

/** Card with the 14 px radius token (Normal_Palette card). */
export const CARD_14 =
  'relative isolate overflow-hidden [&>svg+*]:!mt-0 rounded-card border border-normal-card-border bg-normal-card p-4 text-normal-text haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text';

export const MUTED_TEXT = 'text-normal-muted haunted:text-haunted-muted';

export const ACCENT_TEXT =
  'text-normal-accent hover:text-normal-accent-hover active:text-normal-accent-hover haunted:text-haunted-accent haunted:hover:text-haunted-accent-hover haunted:active:text-haunted-accent-hover';

export const ACCENT_BUTTON =
  'border border-normal-accent bg-normal-accent text-normal-card hover:border-normal-accent-hover hover:bg-normal-accent-hover active:border-normal-accent-hover active:bg-normal-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:border-haunted-accent-hover haunted:hover:bg-haunted-accent-hover haunted:active:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

/** Urgency_Meter step colours (Requirement 7.4). Each level has its own badge pair. */
export const URGENCY_METER_COLORS: Record<UrgencyLevel, string> = {
  monitor:
    'border border-badge-monitor-text bg-badge-monitor-bg text-badge-monitor-text haunted:border-haunted-ok haunted:bg-haunted-field haunted:text-haunted-text',
  soon:
    'border border-badge-soon-text bg-badge-soon-bg text-badge-soon-text haunted:border-haunted-soon haunted:bg-haunted-field haunted:text-haunted-text',
  urgent:
    'border border-badge-urgent-text bg-badge-urgent-bg text-badge-urgent-text haunted:border-haunted-accent haunted:bg-haunted-field haunted:text-haunted-text',
  emergency:
    'border border-badge-emergency-bg bg-badge-emergency-bg text-badge-emergency-text haunted:border-haunted-error haunted:bg-haunted-field haunted:text-haunted-text',
};

/** Filter_Chip colours for the selected and unselected states, with hover and pressed colours. */
export const FILTER_CHIP_COLORS: Record<FilterChipState, string> = {
  selected:
    'border border-normal-accent bg-normal-accent text-normal-card hover:bg-normal-accent-hover active:bg-normal-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover haunted:active:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg',
  unselected:
    'border border-normal-card-border bg-normal-card text-normal-text hover:bg-normal-page active:bg-normal-table-head focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:hover:bg-haunted-surface haunted:active:bg-haunted-surface haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg',
};

/**
 * Sticky only in the `tall` screen (min-height 900px and min-width 1024px, see tailwind.config.ts).
 * Below that the panel is a normal block that scrolls with the page. No overflow-y, max-height or
 * inner scroll box, so the whole panel is always shown.
 */
export const STICKY_PANEL = 'tall:sticky tall:top-20';

export const HEADING =
  'break-words text-sm font-semibold uppercase tracking-wide text-normal-muted haunted:text-haunted-muted';

export const PAGE_TITLE = 'text-2xl font-bold text-normal-text haunted:text-haunted-accent';

export const BODY = 'text-base text-normal-text haunted:text-haunted-text';

export const MUTED = 'text-sm text-normal-muted haunted:text-haunted-muted';

export const FIELD =
  'border border-normal-muted bg-normal-card text-normal-text focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:placeholder:text-haunted-muted haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const PRIMARY_BUTTON =
  'border border-normal-accent bg-normal-accent text-normal-card hover:border-normal-accent-hover hover:bg-normal-accent-hover active:border-normal-accent-hover active:bg-normal-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:border-haunted-accent-hover haunted:hover:bg-haunted-accent-hover haunted:active:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const SECONDARY_BUTTON =
  'border border-normal-muted bg-normal-card text-normal-text hover:bg-normal-page active:bg-normal-table-head focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:hover:bg-haunted-surface haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const ERROR_TEXT = 'text-normal-emergency haunted:text-haunted-error';

export const STATUS_BOX =
  'relative isolate overflow-hidden [&>svg+*]:!mt-0 rounded-lg border border-normal-card-border bg-normal-page p-4 text-normal-text haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text';

/** Fixed style for the Pro emergency note. No `haunted:` class, so it looks the same in every theme. */
export const NOTE_BOX = 'rounded-lg border border-normal-card-border bg-normal-page p-4 text-normal-text';
