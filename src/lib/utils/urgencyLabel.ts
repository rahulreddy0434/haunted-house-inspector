import type { UrgencyLevel } from '@/types/inspection';

const LABELS: Record<UrgencyLevel, string> = {
  emergency: 'Emergency',
  urgent: 'Urgent — act today',
  soon: 'Soon — within a week',
  monitor: 'Monitor — keep an eye on it',
};

export function urgencyLabel(urgency: UrgencyLevel): string {
  return LABELS[urgency];
}
