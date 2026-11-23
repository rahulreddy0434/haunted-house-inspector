import 'server-only';

import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { HelpEmail } from '@/lib/help/email';

/** Thrown when CONTACT_FROM_EMAIL or CONTACT_TO_EMAIL is unset. The message holds no address. */
export class MissingConfigError extends Error {
  constructor() {
    super('Contact email configuration is missing');
    this.name = 'MissingConfigError';
  }
}

let client: SESv2Client | undefined;

export function getSesClient(): SESv2Client {
  if (!client) {
    // Credentials come from the default provider chain (IAM role / CLI profile).
    client = new SESv2Client({ region: process.env.APP_AWS_REGION });
  }
  return client;
}

/** Sends one Help_Email. Errors propagate; callers log the error name only. */
export async function sendHelpEmail(email: HelpEmail): Promise<void> {
  const from = process.env.CONTACT_FROM_EMAIL;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!from || !to) {
    throw new MissingConfigError();
  }
  await getSesClient().send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: [email.replyTo],
      Content: {
        Simple: {
          Subject: { Data: email.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: email.text, Charset: 'UTF-8' } },
        },
      },
    }),
  );
}
