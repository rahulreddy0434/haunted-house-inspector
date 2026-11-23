import type { HelpRecordInput } from '@/lib/help/record';

/** Fixed subjects. Visitor text never enters a subject (Req 13.5). */
export const HELP_SUBJECT = 'Haunted House Inspector: new help message';
export const HELP_SUBJECT_EMERGENCY = 'Haunted House Inspector: new help message (EMERGENCY)';

export interface HelpEmail {
  subject: string;
  /** The Visitor's email with CR and LF removed. */
  replyTo: string;
  text: string;
}

/** Removes every CR and LF so a value cannot add a header line. */
export function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

/**
 * Builds the Help_Email from named fields only. The body never holds an IP address,
 * Hashed_IP or cookie value, because none of them is an input.
 */
export function buildHelpEmail(input: HelpRecordInput): HelpEmail {
  const lines = [
    ...(input.emergency ? ['EMERGENCY: the sender described a possible danger.', ''] : []),
    `Name: ${input.name ?? '(not given)'}`,
    `Email: ${input.email}`,
    `Side: ${input.side}`,
    `Page: ${input.page}`,
    ...(input.jobId ? [`Job id: ${input.jobId}`] : []),
    '',
    'Message:',
    input.message,
  ];
  return {
    subject: input.emergency ? HELP_SUBJECT_EMERGENCY : HELP_SUBJECT,
    replyTo: stripLineBreaks(input.email),
    text: lines.join('\n'),
  };
}
