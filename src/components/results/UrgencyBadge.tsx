import type { UrgencyLevel } from "@/types/inspection";
import { urgencyLabel } from "@/lib/utils/urgencyLabel";

export interface UrgencyBadgeProps {
  urgency: UrgencyLevel;
}

/**
 * Tailwind classes per urgency level: background, text, border.
 * Normal theme uses light tints with dark text (WCAG AA contrast);
 * Haunted theme (`.theme-haunted` on root) uses dark tints with light text.
 * Hues match the `urgency.*` tokens in tailwind.config.ts
 * (red / orange / yellow / green).
 */
const URGENCY_CLASSES: Record<UrgencyLevel, string> = {
  emergency:
    "bg-red-100 text-red-900 border-red-600 haunted:bg-red-950 haunted:text-red-100 haunted:border-red-400",
  urgent:
    "bg-orange-100 text-orange-900 border-orange-600 haunted:bg-orange-950 haunted:text-orange-100 haunted:border-orange-400",
  soon:
    "bg-yellow-100 text-yellow-900 border-yellow-600 haunted:bg-yellow-950 haunted:text-yellow-100 haunted:border-yellow-400",
  monitor:
    "bg-green-100 text-green-900 border-green-600 haunted:bg-green-950 haunted:text-green-100 haunted:border-green-400",
};

/** Decorative symbol per level; hidden from assistive tech so the text label carries meaning. */
const URGENCY_ICON: Record<UrgencyLevel, string> = {
  emergency: "!",
  urgent: "▲",
  soon: "●",
  monitor: "✓",
};

export function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
  return (
    <span
      data-urgency={urgency}
      role={urgency === "emergency" ? "status" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${URGENCY_CLASSES[urgency]}`}
    >
      <span aria-hidden="true">{URGENCY_ICON[urgency]}</span>
      {urgencyLabel(urgency)}
    </span>
  );
}
