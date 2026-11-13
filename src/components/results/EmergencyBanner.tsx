import type { UrgencyLevel } from "@/types/inspection";
import { EMERGENCY_MESSAGE } from "@/lib/emergency/messages";

export { EMERGENCY_MESSAGE };

export interface EmergencyBannerProps {
  urgency: UrgencyLevel;
}

/** Shown only for emergencies. Message is fixed by safety rules; no other advice here. */
export function EmergencyBanner({ urgency }: EmergencyBannerProps) {
  if (urgency !== "emergency") return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-4 rounded-lg border-4 border-red-900 bg-red-700 p-5 text-white haunted:border-red-300 haunted:bg-red-900 haunted:text-red-50"
    >
      <span
        aria-hidden="true"
        className="shrink-0 text-4xl font-extrabold leading-none"
      >
        ⚠
      </span>
      <p className="text-xl font-bold leading-snug">{EMERGENCY_MESSAGE}</p>
    </div>
  );
}
