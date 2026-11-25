import type { InspectionResult } from "@/types/inspection";
import { EMERGENCY_MESSAGE } from "@/lib/emergency/messages";
import { emergencyReasonSentence } from "@/lib/emergency/reasons";

/** True when either the urgency or the flag marks the result as an emergency. */
export function isEmergencyResult(
  r: Pick<InspectionResult, "urgency" | "isEmergency">,
): boolean {
  return r.urgency === "emergency" || r.isEmergency === true;
}

/**
 * Client copy of a result after an emergency response.
 * Keeps id, createdAt, s3Keys, likelyIssue, trade and answers.
 */
export function toEmergencyResult(r: InspectionResult): InspectionResult {
  return {
    id: r.id,
    createdAt: r.createdAt,
    s3Keys: r.s3Keys,
    likelyIssue: r.likelyIssue,
    trade: r.trade,
    answers: r.answers,
    urgency: "emergency",
    isEmergency: true,
    confidence: r.confidence,
    costRangeLow: 0,
    costRangeHigh: 0,
    jobBrief: "",
    followUpQuestions: r.followUpQuestions,
    diySteps: [],
    // Saved rule and source are carried through unchanged; absent stays absent.
    ...(r.emergencyRule !== undefined ? { emergencyRule: r.emergencyRule } : {}),
    ...(r.emergencySource !== undefined ? { emergencySource: r.emergencySource } : {}),
  };
}

/** `{ reasonSentence }` for a saved rule code, or `{}` when there is none (the key is omitted). */
export function reasonSentenceField(code: string | undefined): { reasonSentence?: string } {
  const sentence = emergencyReasonSentence(code);
  return sentence !== undefined ? { reasonSentence: sentence } : {};
}

/** Body of every emergency response. */
export function emergencyResponseBody(code?: string): {
  status: "emergency";
  message: string;
  reasonSentence?: string;
} {
  return { status: "emergency", message: EMERGENCY_MESSAGE, ...reasonSentenceField(code) };
}
