/** Exact, fixed emergency text shown to the homeowner. Never built from user or Pro text. */
export const EMERGENCY_MESSAGE =
  "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.";

/** Exact note the Pro API returns (as `emergencyNote`) for an emergency Job. */
export const PRO_EMERGENCY_NOTE =
  "Emergency: the homeowner was told to call 911";

/** Fixed likely-issue text stored and shown for every emergency result. */
export const EMERGENCY_LIKELY_ISSUE = "Possible emergency";

/** Fixed follow-up questions stored for every emergency result. */
export const EMERGENCY_FOLLOW_UP_QUESTIONS: [string, string] = [
  "Is everyone out of the affected area?",
  "Have you contacted emergency services or your utility?",
];
