import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from "@/lib/emergency/messages";
import type { ApiErrorCode, JobStatus } from "@/types/job";

/** Status labels shown to the tradesperson (Requirement 6.5). */
export const PRO_STATUS_LABEL: Record<JobStatus, string> = {
  new: "New",
  info_requested: "Waiting for the homeowner's reply",
  accepted: "Accepted, waiting for the homeowner to pick a time",
  declined: "Declined",
  booked: "Booked",
  emergency: "Emergency",
};

/**
 * Status texts shown to the homeowner (Requirement 8.3).
 * `emergency` has no entry: the homeowner sees EMERGENCY_MESSAGE instead.
 */
export const HOMEOWNER_STATUS_TEXT: Record<Exclude<JobStatus, "emergency">, string> = {
  new: "Waiting for a tradesperson to look at your job",
  info_requested: "A tradesperson has a question for you",
  accepted: "A tradesperson can take your job. Pick a time that suits you.",
  declined: "This tradesperson can't take your job right now",
  booked: "Your booking is confirmed",
};

/** Shown only in `declined` and `booked`, never for an emergency (Requirement 8.19). */
export const STATUS_SAFETY_LINE =
  "If something changes, start a new inspection. If you smell gas, see sparks or hear a CO alarm, leave the home and call 911.";

/** Retention note for replies (Requirements 9, 14). */
export const REPLY_RETENTION_NOTE = "Your replies are deleted after 30 days, like your photos.";

/** Shown when a status refresh fails. */
export const STATUS_REFRESH_FAILED = "We couldn't update the status. We'll try again.";

/** Shown after a 409 from reply or book (Requirement 9). */
export const JOB_CHANGED_NOTICE = "This job has changed. Here is the latest.";

/** Reply 413 message in the Status_Panel (Requirement 9). */
export const REPLY_TOO_LARGE_MESSAGE = "Please shorten your reply.";

/** Reply messages for code INVALID_REQUEST (Requirement 9.12). */
export const REPLY_TOO_LONG_MESSAGE =
  "Your reply is too long. Please shorten it to 500 characters or fewer.";
export const REPLY_EMPTY_MESSAGE = "Please write a reply before sending.";

/** Messages for every ApiErrorCode. Codes with variants hold an object. */
export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Access is needed, or your session has ended.",
  INVALID_CODE: "That code isn't right.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a few minutes and try again.",
  PRO_DISABLED: "Tradesperson access isn't available right now.",
  LOGIN_FAILED: "Login failed. Please try again later.",
  INVALID_REQUEST: "We couldn't read that request.",
  PAYLOAD_TOO_LARGE: "That request is too large.",
  NOT_FOUND: "We couldn't find that job.",
  LOAD_FAILED: {
    list: "We couldn't load the jobs. Please try again.",
    detail: "We couldn't load this job. Please try again.",
    status: "We couldn't load this status. Please try again.",
  },
  RESULT_INVALID: "This job could not be loaded.",
  ILLEGAL_TRANSITION: "This job has changed. Refresh to see its latest status.",
  JOB_IS_EMERGENCY: {
    pro: PRO_EMERGENCY_NOTE,
    homeowner: EMERGENCY_MESSAGE,
  },
  REPLY_LIMIT_REACHED: "This job has reached the limit of 5 replies.",
  SLOT_NOT_OFFERED: "That time isn't one of the times offered.",
  SLOT_EXPIRED: "That time has passed. Please pick another.",
  ACTION_FAILED: "Something went wrong. Please try again.",
} as const satisfies Record<ApiErrorCode, string | Readonly<Record<string, string>>>;
