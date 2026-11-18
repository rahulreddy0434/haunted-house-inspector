/**
 * Shared Tailwind class recipes. Colour comes only from token classes, and each
 * Normal-theme colour has a `haunted:` partner. No animation or transition classes.
 */

export const CARD =
  'rounded-lg border border-slate-300 bg-white p-4 text-slate-900 haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text';

export const HEADING =
  'text-sm font-semibold uppercase tracking-wide text-slate-600 haunted:text-haunted-muted';

export const PAGE_TITLE = 'text-2xl font-bold text-slate-900 haunted:text-haunted-accent';

export const BODY = 'text-base text-slate-900 haunted:text-haunted-text';

export const MUTED = 'text-sm text-slate-700 haunted:text-haunted-muted';

export const FIELD =
  'border border-gray-500 bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:placeholder:text-haunted-muted haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const PRIMARY_BUTTON =
  'border border-blue-800 bg-blue-700 text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const SECONDARY_BUTTON =
  'border border-slate-500 bg-white text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:hover:bg-haunted-surface haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const ERROR_TEXT = 'text-red-800 haunted:text-haunted-error';

export const STATUS_BOX =
  'rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text';

/** Fixed style for the Pro emergency note. No `haunted:` class, so it looks the same in every theme. */
export const NOTE_BOX = 'rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900';
