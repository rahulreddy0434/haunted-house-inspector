import 'server-only';

import { checkEmergency } from '@/lib/safety/safetyLayer';

/** Evaluates a reply as one context answer on its own (Requirement 9.4). */
export function replyTriggersEmergency(text: string): boolean {
  return checkEmergency({
    contextAnswers: { location: text, duration: '', recentChanges: '' },
  }).isEmergency;
}
