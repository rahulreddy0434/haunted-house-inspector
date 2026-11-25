import type { EmergencyConditionCode } from '@/lib/safety/safetyLayer';

export const EMERGENCY_REASON_SENTENCES: Record<EmergencyConditionCode, string> = {
  GAS_SMELL: 'This may be a gas leak.',
  ELECTRICAL_FIRE: 'This may be an electrical fire risk.',
  WATER_ELECTRICAL: 'Water near electricity can cause shocks or a fire.',
  CO_ALARM: 'A carbon monoxide alarm means the air may be unsafe to breathe.',
};

/** Total: unknown or absent codes (older jobs, or a job saved before this feature) get no sentence. */
export function emergencyReasonSentence(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(EMERGENCY_REASON_SENTENCES, code)
    ? EMERGENCY_REASON_SENTENCES[code as EmergencyConditionCode]
    : undefined;
}
