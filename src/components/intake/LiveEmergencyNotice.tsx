import { EmergencyBanner } from "@/components/results/EmergencyBanner";

export interface LiveEmergencyNoticeProps {
  active: boolean;
}

/**
 * Shows the fixed emergency banner while a safety chip is on.
 * Mounted only: it never takes focus, so the chip keeps it.
 */
export function LiveEmergencyNotice({ active }: LiveEmergencyNoticeProps) {
  return active ? <EmergencyBanner urgency="emergency" /> : null;
}
