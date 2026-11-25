import { z } from 'zod';
import { REPLY_EMPTY_MESSAGE, REPLY_TOO_LONG_MESSAGE } from '@/lib/jobs/copy';

// Zod 4. Importable from browser and server code.
const isoUtc = z.iso.datetime();

/** Body of a chat send. Text is trimmed, then 1 to 500 characters. */
export const chatSendBodySchema = z.object({
  text: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { message: REPLY_EMPTY_MESSAGE })
        .max(500, { message: REPLY_TOO_LONG_MESSAGE }),
    ),
});

/** The `after` cursor of a chat read: an integer 0 to 100. */
export const chatAfterSchema = z.coerce.number().int().min(0).max(100);

const chatMessageSchema = z.object({
  id: z.string().regex(/^(c|q|r)-\d+$/),
  side: z.enum(['homeowner', 'tradesperson']),
  text: z.string(),
  sentAt: isoUtc,
  legacy: z.boolean(),
});

const bookingDataSchema = z.object({
  offeredSlots: z.array(isoUtc).optional(),
  bookedSlot: isoUtc.optional(),
  declineReason: z.string().optional(),
});

const jobStateShape = {
  status: z.enum(['new', 'info_requested', 'accepted', 'declined', 'booked']),
  booking: bookingDataSchema,
  chatState: z.enum(['open', 'read_only']),
};

export const chatReadResponseSchema = z.object({
  ...jobStateShape,
  messages: z.array(chatMessageSchema),
  lastSeq: z.number().int().min(0).max(100),
});

export const chatSendResponseSchema = z.object({
  ...jobStateShape,
  message: chatMessageSchema,
});

export const chatEmergencyResponseSchema = z.object({
  status: z.literal('emergency'),
  message: z.string(),
  reasonSentence: z.string().optional(),
});
