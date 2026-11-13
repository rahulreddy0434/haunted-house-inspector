import type { InspectionResult, UrgencyLevel, ContextAnswers } from '@/types/inspection';

export const JOB_STATUSES = ['new', 'info_requested', 'accepted', 'declined', 'booked', 'emergency'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_ACTIONS = ['accept', 'decline', 'ask_info', 'reply', 'book', 'safety_override'] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];

/** ISO 8601 UTC with a Z suffix, canonical form from Date.prototype.toISOString (e.g. 2026-03-05T20:00:00.000Z). */
export type TimeSlot = string;

export interface InfoRequest { question: string; askedAt: string }   // question 1..300 chars
export interface ReplyEntry { text: string; at: string }             // text 1..500 chars

/** A Job as the server uses it after storedJobSchema validation (no PK, SK, ttl, GSI1PK, GSI1SK). */
export interface JobRecord extends InspectionResult {
  status: JobStatus;                 // already passed through effectiveStatus()
  statusUpdatedAt: string;
  offeredSlots?: TimeSlot[];         // 1..3, ascending
  bookedSlot?: TimeSlot;
  bookedAt?: string;
  declineReason?: string;            // 1..200 chars
  infoRequests: InfoRequest[];       // 0..5
  replies: ReplyEntry[];             // 0..5
  replyCount: number;                // 0..5, equals replies.length
}

// ── Pro views ───────────────────────────────────────────────────────────────
export interface ProJobListItem {
  id: string;
  createdAt: string;
  urgency: UrgencyLevel;
  trade: string | null;              // null when emergency (Requirement 4.7)
  location: string;                  // answers.location
  status: JobStatus;
}

export interface ProJobDetailActive {
  id: string; createdAt: string; status: Exclude<JobStatus, 'emergency'>;
  urgency: Exclude<UrgencyLevel, 'emergency'>;
  likelyIssue: string; trade: string; confidence: number;
  costRangeLow: number; costRangeHigh: number; jobBrief: string;
  followUpQuestions: [string, string];
  answers: ContextAnswers;
  infoRequests: InfoRequest[]; replies: ReplyEntry[];
  offeredSlots?: TimeSlot[]; bookedSlot?: TimeSlot; declineReason?: string;
  photos: string[];                  // pre-signed GET URLs, 900 s, per request
}

export interface ProJobDetailEmergency {
  id: string; createdAt: string; status: 'emergency'; urgency: 'emergency';
  likelyIssue: string; answers: ContextAnswers;
  emergencyNote: string;             // PRO_EMERGENCY_NOTE
}
export type ProJobDetail = ProJobDetailActive | ProJobDetailEmergency;

// ── Homeowner view ──────────────────────────────────────────────────────────
export type HomeownerStatusView =
  | { status: 'new' }
  | { status: 'info_requested'; question: string }
  | { status: 'accepted'; offeredSlots: TimeSlot[] }
  | { status: 'declined'; reason?: string }
  | { status: 'booked'; bookedSlot: TimeSlot }
  | { status: 'emergency'; message: string };

export type ApiErrorCode =
  | 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'UNAUTHORIZED' | 'INVALID_CODE' | 'TOO_MANY_ATTEMPTS'
  | 'PRO_DISABLED' | 'LOGIN_FAILED' | 'NOT_FOUND' | 'LOAD_FAILED' | 'RESULT_INVALID'
  | 'ILLEGAL_TRANSITION' | 'JOB_IS_EMERGENCY' | 'REPLY_LIMIT_REACHED'
  | 'SLOT_NOT_OFFERED' | 'SLOT_EXPIRED' | 'ACTION_FAILED';

export interface ApiErrorBody { error: ApiErrorCode; message: string; status?: JobStatus }
