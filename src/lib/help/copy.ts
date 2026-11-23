export const HELP_HEADING = 'Need help? Contact us';

/** Confirmation text. Same wording in both themes and for every success case. */
export function helpConfirmation(email: string): string {
  return `Thank you, we got your message. We'll reply to ${email} within the next 24 hours.`;
}

export const HELP_PRIVACY_LINE = 'We use your email only to reply to you.';

export const HELP_SENDING_TEXT = 'Sending your message…';
export const HELP_SUBMIT_LABEL = 'Send message';

export const HELP_FIELD_LABELS = {
  name: 'Name (optional)',
  email: 'Email',
  message: 'Message',
} as const;

/** Accessible name of the Honeypot input. */
export const HELP_HONEYPOT_LABEL = 'Leave this field empty';
