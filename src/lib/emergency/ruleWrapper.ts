import { checkEmergency, type EmergencyConditionCode } from '@/lib/safety/safetyLayer';

/**
 * Emergency_Rule_Wrapper: supplies the Emergency_Rule code for a text. It calls the unchanged
 * checkEmergency with the same single-answer input that replyTriggersEmergency uses and decides
 * nothing itself. Routes decide with replyTriggersEmergency and call this only to get the code.
 */
export function emergencyRuleFor(text: string): { isEmergency: boolean; rule?: EmergencyConditionCode } {
  const result = checkEmergency({
    contextAnswers: { location: text, duration: '', recentChanges: '' },
  });
  return { isEmergency: result.isEmergency, rule: result.triggeredCondition };
}
