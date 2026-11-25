import type { JobStatus, TimeSlot } from '@/types/job';

export const CHAT_SIDES = ['homeowner', 'tradesperson'] as const;
export type ChatSide = (typeof CHAT_SIDES)[number];

export interface ChatMessage {
  /** `c-<seq>` for a stored message, `q-<i>` / `r-<i>` for a Legacy_Message. */
  id: string;
  side: ChatSide;
  text: string;
  /** ISO 8601 UTC with Z. */
  sentAt: string;
  legacy: boolean;
}

/** Only the booking facts that exist for the status. */
export interface BookingData {
  offeredSlots?: TimeSlot[]; // status accepted, ascending
  bookedSlot?: TimeSlot; // status booked
  declineReason?: string; // status declined, when given
}

export type ChatAccess = 'open' | 'read_only' | 'closed';

interface ChatJobState {
  status: Exclude<JobStatus, 'emergency'>;
  booking: BookingData;
  chatState: 'open' | 'read_only';
}

/** GET. `messages` holds the messages after the cursor; `lastSeq` is the new cursor. */
export interface ChatReadResponse extends ChatJobState {
  messages: ChatMessage[];
  lastSeq: number;
}

/** POST success. The saved message only; the client re-polls to get the rest. */
export interface ChatSendResponse extends ChatJobState {
  message: ChatMessage;
}

/** POST 200 for a Homeowner Trigger. Same shape as the reply route. */
export interface ChatEmergencyResponse {
  status: 'emergency';
  message: string;
  reasonSentence?: string;
}
