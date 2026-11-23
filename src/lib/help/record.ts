import { ttlFromNow } from '@/lib/aws/ttl';
import type { HelpBody } from '@/lib/help/schema';

/** What a Help_Message carries once it has passed the strict parse. */
export interface HelpRecordInput extends HelpBody {
  /** True when the Message or Name was a Trigger. */
  emergency: boolean;
}

/**
 * Stored Help_Record. No GSI1 attributes, so it never enters the Job_Index.
 * It holds no IP address, Hashed_IP or cookie value (Req 13.2).
 */
export interface HelpRecord extends HelpRecordInput {
  PK: string;
  SK: string;
  /** ISO 8601 UTC with Z. */
  createdAt: string;
  /** Epoch seconds, 30 days after the save time. */
  ttl: number;
}

export function helpKey(id: string): { PK: string; SK: string } {
  const key = `HELP#${id}`;
  return { PK: key, SK: key };
}

/** Builds the record from named fields only, so no other request data can leak in. */
export function toHelpRecord(
  input: HelpRecordInput,
  options: { id: string; nowMs: number },
): HelpRecord {
  return {
    ...helpKey(options.id),
    ...(input.name !== undefined ? { name: input.name } : {}),
    email: input.email,
    message: input.message,
    side: input.side,
    page: input.page,
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    emergency: input.emergency,
    createdAt: new Date(options.nowMs).toISOString(),
    ttl: ttlFromNow(options.nowMs),
  };
}
