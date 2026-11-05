/**
 * Raw response shape returned by Amazon Nova Lite via Bedrock.
 * The Safety Layer is responsible for handling emergency conditions;
 * Bedrock never returns 'emergency' as an urgency value.
 */
export interface BedrockInspectionResponse {
  likelyIssue: string;
  trade: string;
  urgency: 'urgent' | 'soon' | 'monitor'; // Bedrock never returns 'emergency'
  confidence: number;
  costRangeLow: number;
  costRangeHigh: number;
  jobBrief: string;
  followUpQuestions: [string, string];
  diySteps: string[];
}
