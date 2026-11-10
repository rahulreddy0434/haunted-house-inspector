import type { ContextAnswers } from '@/types/inspection';

export const MAX_ANSWER_LENGTH = 500;

/** Keep only the first MAX_ANSWER_LENGTH characters of an answer. */
export function clampAnswer(text: string): string {
  return text.length > MAX_ANSWER_LENGTH ? text.slice(0, MAX_ANSWER_LENGTH) : text;
}

/** A location is valid when it has at least one non-whitespace character. */
export function isLocationValid(location: string): boolean {
  return location.trim().length > 0;
}

/**
 * Build the body for POST /api/inspect. All three answer fields are always
 * present (blank optional answers stay as empty strings) and values are copied
 * unchanged; the server schema trims location.
 * NOTE: useUpload (task 16.1) must use this function to build its request body.
 */
export function buildInspectRequestBody(
  s3Keys: string[],
  answers: ContextAnswers,
): { s3Keys: string[]; answers: ContextAnswers } {
  return {
    s3Keys: [...s3Keys],
    answers: {
      location: answers.location,
      duration: answers.duration,
      recentChanges: answers.recentChanges,
    },
  };
}
