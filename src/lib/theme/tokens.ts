/**
 * Token names (not values) for the urgency meter, the job tracker and the Filter_Chips.
 * The colour values live once in tailwind.config.ts; recipes in components/ui/styles.ts turn
 * these names into classes. No hex or rgb value belongs in this file.
 */
import type { UrgencyLevel } from '@/types/inspection';

/** Tailwind colour tokens for the urgency badge and meter, as `<level>-bg` and `<level>-text`. */
export const URGENCY_TOKEN_NAMES = {
  monitor: { bg: 'badge-monitor-bg', text: 'badge-monitor-text' },
  soon: { bg: 'badge-soon-bg', text: 'badge-soon-text' },
  urgent: { bg: 'badge-urgent-bg', text: 'badge-urgent-text' },
  emergency: { bg: 'badge-emergency-bg', text: 'badge-emergency-text' },
} as const satisfies Record<UrgencyLevel, { bg: string; text: string }>;

export type UrgencyTokenName = (typeof URGENCY_TOKEN_NAMES)[UrgencyLevel]['bg' | 'text'];

/** Tracker step states and the token each one is drawn from. */
export const TRACKER_STATE_TOKENS = {
  done: 'normal-accent',
  current: 'normal-accent',
  upcoming: 'normal-card-border',
} as const;

export type TrackerStateName = keyof typeof TRACKER_STATE_TOKENS;

/** Filter_Chip ids on the Pro job list, in display order. */
export const FILTER_CHIP_IDS = ['all', 'new', 'waiting', 'accepted', 'booked', 'emergency'] as const;

export type FilterChipId = (typeof FILTER_CHIP_IDS)[number];

/** Filter_Chip states and the token each one is drawn from. */
export const FILTER_CHIP_TOKENS = {
  selected: { bg: 'normal-accent', text: 'normal-card', border: 'normal-accent' },
  unselected: { bg: 'normal-card', text: 'normal-text', border: 'normal-card-border' },
} as const;

export type FilterChipState = keyof typeof FILTER_CHIP_TOKENS;
