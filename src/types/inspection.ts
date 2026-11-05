export type UrgencyLevel = 'emergency' | 'urgent' | 'soon' | 'monitor';

export interface ContextAnswers {
  location: string;      // question (a) — required, max 500 chars
  duration: string;      // question (b) — optional, max 500 chars
  recentChanges: string; // question (c) — optional, max 500 chars
}

export interface InspectionResult {
  id: string;                      // UUID, generated server-side
  createdAt: string;               // ISO 8601 UTC
  s3Keys: string[];                // keys of uploaded frames/images

  // Bedrock output (after Safety Layer merge)
  likelyIssue: string;             // max 500 chars
  trade: string;                   // max 100 chars
  urgency: UrgencyLevel;
  confidence: number;              // 0–1 inclusive
  costRangeLow: number;            // 0–999999; absent when urgency=emergency
  costRangeHigh: number;           // 0–999999; absent when urgency=emergency
  jobBrief: string;                // max 1000 chars; absent when urgency=emergency
  followUpQuestions: [string, string]; // exactly 2, max 200 chars each
  diySteps: string[];              // empty array for electrician/gas engineer trades or emergency
  isEmergency: boolean;

  // Context answers
  answers: ContextAnswers;
}
