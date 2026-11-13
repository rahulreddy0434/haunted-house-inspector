import type { InspectionResult } from "@/types/inspection";
import { EMERGENCY_MESSAGE } from "@/lib/emergency/messages";

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
  };
}

/** Body of every emergency response. */
export function emergencyResponseBody(): {
  status: "emergency";
  message: string;
} {
  return { status: "emergency", message: EMERGENCY_MESSAGE };
}
