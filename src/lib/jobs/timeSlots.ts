import { z } from 'zod';
import type { TimeSlot } from '@/types/job';

export const MAX_SLOTS = 3;
export const SLOT_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export type SlotRule = 'count' | 'format' | 'distinct' | 'past' | 'horizon';

export const SLOT_RULE_MESSAGES: Record<SlotRule, string> = {
  count: 'Offer between 1 and 3 times.',
  format: 'Each time must be a valid date and time.',
  distinct: 'Each time must be different.',
  past: 'Each time must be in the future.',
  horizon: 'Each time must be within the next 30 days.',
};

/** Sorted ascending by instant, each in `toISOString()` form (Requirement 7.3). */
export function canonicalizeSlots(slots: readonly string[]): TimeSlot[] {
  return slots
    .map((s) => Date.parse(s))
    .sort((a, b) => a - b)
    .map((t) => new Date(t).toISOString());
}

/**
 * Validates and canonicalizes offered slots. `nowMs` is injected so tests
 * control time. Each issue message is a `SlotRule` key, so the route can map
 * the first issue to the plain text in `SLOT_RULE_MESSAGES`.
 */
export function slotsSchema(nowMs: number) {
  return z
    .array(z.iso.datetime({ message: 'format' }), { error: 'count' })
    .min(1, { message: 'count' })
    .max(MAX_SLOTS, { message: 'count' })
    .superRefine((slots, ctx) => {
      const t = slots.map((s) => Date.parse(s));
      if (t.some(Number.isNaN)) {
        ctx.addIssue({ code: 'custom', message: 'format' });
      } else if (new Set(t).size !== t.length) {
        ctx.addIssue({ code: 'custom', message: 'distinct' });
      } else if (t.some((x) => x <= nowMs)) {
        ctx.addIssue({ code: 'custom', message: 'past' });
      } else if (t.some((x) => x > nowMs + SLOT_HORIZON_MS)) {
        ctx.addIssue({ code: 'custom', message: 'horizon' });
      }
    })
    .transform(canonicalizeSlots);
}

/** Exact string equality against the stored canonical slots (Requirement 10.3). */
export function isSlotOffered(offered: readonly string[], slot: string): boolean {
  return offered.includes(slot);
}

/** True when the slot start is not later than now (Requirement 10.4). */
export function isSlotExpired(slot: string, nowMs: number): boolean {
  return Date.parse(slot) <= nowMs;
}
