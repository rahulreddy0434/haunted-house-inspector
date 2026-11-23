import { z } from 'zod';
import { CHAT_SIDES } from '@/types/chat';

/** Route path with the Job id removed. Anything else is rejected (Req 11.8). */
export const HELP_PAGES = ['/', '/inspect', '/pro', '/pro/jobs'] as const;
export type HelpPage = (typeof HELP_PAGES)[number];

export const HELP_NAME_MAX = 100;
export const HELP_EMAIL_MAX = 254;
export const HELP_MESSAGE_MAX = 1000;

/** Visitor-facing text for each field error. Shown next to the field and returned by the route. */
export const HELP_FIELD_MESSAGES = {
  name: 'Please keep your name to 100 characters or fewer.',
  email: 'Please enter a valid email address, for example name@example.com.',
  message: 'Please write a message of 1 to 1,000 characters.',
} as const satisfies Record<'name' | 'email' | 'message', string>;

/**
 * Type-only parse used before the Safety_Layer. Only `message` must be a string;
 * every other field stays `unknown` so a bad field never delays the safety check.
 */
export const helpLooseBodySchema = z.object({
  message: z.string(),
  name: z.unknown().optional(),
  email: z.unknown().optional(),
  website: z.unknown().optional(),
  page: z.unknown().optional(),
  side: z.unknown().optional(),
  jobId: z.unknown().optional(),
});

/** Strict parse, run after the Safety_Layer and the Honeypot check. Trims text. */
export const helpBodySchema = z.object({
  name: z
    .string()
    .trim()
    .max(HELP_NAME_MAX)
    .optional()
    .transform((value) => (value ? value : undefined)),
  email: z.string().trim().max(HELP_EMAIL_MAX).pipe(z.email()),
  message: z.string().trim().min(1).max(HELP_MESSAGE_MAX),
  page: z.enum(HELP_PAGES),
  side: z.enum(CHAT_SIDES),
  jobId: z.uuid().optional(),
});

type ParsedHelpBody = z.infer<typeof helpBodySchema>;

/** Name is left out of the object when empty, so it never reaches DynamoDB as `undefined`. */
export type HelpBody = Omit<ParsedHelpBody, 'name'> & { name?: string };
