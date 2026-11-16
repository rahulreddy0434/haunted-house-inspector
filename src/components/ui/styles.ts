/**
 * Shared Tailwind class recipes. Colour comes only from token classes, and each
 * Normal-theme colour has a `haunted:` partner. No animation or transition classes.
 */

export const CARD =
  'rounded-lg border border-slate-300 bg-white p-4 text-slate-900 haunted:border-slate-600 haunted:bg-slate-900 haunted:text-slate-100';

export const HEADING =
  'text-sm font-semibold uppercase tracking-wide text-slate-600 haunted:text-slate-300';

export const BODY = 'text-base text-slate-900 haunted:text-slate-100';

export const MUTED = 'text-sm text-slate-700 haunted:text-slate-300';

export const FIELD =
  'border border-gray-400 bg-white text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export const PRIMARY_BUTTON =
  'border border-blue-800 bg-blue-700 text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-purple-300 haunted:bg-purple-700 haunted:hover:bg-purple-600 haunted:focus-visible:ring-purple-300';

export const SECONDARY_BUTTON =
  'border border-slate-500 bg-white text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-slate-400 haunted:bg-slate-900 haunted:text-slate-100 haunted:hover:bg-slate-800 haunted:focus-visible:ring-purple-300';

export const ERROR_TEXT = 'text-red-800 haunted:text-red-300';

export const STATUS_BOX =
  'rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900 haunted:border-slate-600 haunted:bg-slate-800 haunted:text-slate-100';
