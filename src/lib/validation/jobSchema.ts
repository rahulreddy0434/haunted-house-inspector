import { z } from 'zod';
import { JOB_STATUSES } from '@/types/job';
import { slotsSchema } from '@/lib/jobs/timeSlots';

// Zod 4. Importable from browser and server code: no server-only import here.

/** Same strictness as the existing `z.string().uuid()` in inspections/[id]/route.ts (Zod 4 alias). */
export const jobIdSchema = z.uuid();
const isoUtc = z.iso.datetime(); // trailing Z only, as inspectionSchema.ts already uses
const urgencySchema = z.enum(['emergency', 'urgent', 'soon', 'monitor']);
const statusSchema = z.enum(JOB_STATUSES);

// ── request bodies (unknown fields are stripped: Requirement 7.20) ──────────
export const loginBodySchema = z.object({ code: z.string().min(1).max(200) }); // no trim (1.2)

export const declineBodySchema = z
  .object({
    reason: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(200))
      .optional(),
  })
  // An empty or whitespace-only reason becomes absent (7.5, 7.6).
  .transform((b): { reason?: string } => (b.reason ? { reason: b.reason } : {}));

export const askInfoBodySchema = z.object({
  question: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(300)), // 7.7, 7.8
});

/** Length rules run AFTER the Safety_Layer, so only the type is checked here. */
export const replyBodySchema = z.object({ text: z.string() });

export const bookBodySchema = z.object({ slot: z.string() });

/** Accept body, built per request with the injected clock (Requirement 7.2). */
export function acceptBodySchema(nowMs: number) {
  return z.object({ slots: slotsSchema(nowMs) });
}

// ── stored Job (GetItem result; PK, SK, ttl, GSI1* are stripped by Zod) ─────
export const storedJobSchema = z
  .object({
    id: z.string().min(1),
    createdAt: isoUtc,
    s3Keys: z.array(z.string()),
    likelyIssue: z.string().max(500),
    trade: z.string().max(100),
    urgency: urgencySchema,
    confidence: z.number().min(0).max(1),
    costRangeLow: z.number().min(0).max(999999),
    costRangeHigh: z.number().min(0).max(999999),
    jobBrief: z.string().max(1000),
    followUpQuestions: z.tuple([z.string().max(200), z.string().max(200)]),
    diySteps: z.array(z.string()),
    isEmergency: z.boolean(),
    answers: z.object({
      location: z.string().max(500),
      duration: z.string().max(500).default(''),
      recentChanges: z.string().max(500).default(''),
    }),
    status: statusSchema,
    statusUpdatedAt: isoUtc,
    offeredSlots: z.array(isoUtc).min(1).max(3).optional(),
    bookedSlot: isoUtc.optional(),
    bookedAt: isoUtc.optional(),
    declineReason: z.string().min(1).max(200).optional(),
    infoRequests: z
      .array(z.object({ question: z.string().min(1).max(300), askedAt: isoUtc }))
      .max(5)
      .default([]),
    replies: z
      .array(z.object({ text: z.string().min(1).max(500), at: isoUtc }))
      .max(5)
      .default([]),
    replyCount: z.number().int().min(0).max(5).default(0),
  })
  .superRefine((j, ctx) => {
    // An emergency Job must stay readable whatever else is wrong.
    if (j.status === 'emergency') return;
    if (j.replyCount !== j.replies.length) {
      ctx.addIssue({ code: 'custom', path: ['replyCount'], message: 'replyCount' });
    }
    if (j.status === 'info_requested' && j.infoRequests.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['infoRequests'], message: 'question' });
    }
    if (j.status === 'accepted' && !j.offeredSlots) {
      ctx.addIssue({ code: 'custom', path: ['offeredSlots'], message: 'slots' });
    }
    if (j.status === 'booked' && !j.bookedSlot) {
      ctx.addIssue({ code: 'custom', path: ['bookedSlot'], message: 'slot' });
    }
  });

// ── GSI1 list item (projection: id, createdAt, urgency, isEmergency, trade, status, answers) ──
export const proListItemSchema = z.object({
  id: z.string().min(1),
  createdAt: isoUtc,
  urgency: urgencySchema,
  isEmergency: z.boolean(),
  trade: z.string().max(100),
  status: statusSchema,
  answers: z.object({ location: z.string().max(500) }),
});

// ── response schemas used by the browser (Requirements 8.11, 5.17) ──────────
export const homeownerStatusViewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('new') }),
  z.object({ status: z.literal('info_requested'), question: z.string() }),
  z.object({ status: z.literal('accepted'), offeredSlots: z.array(isoUtc).min(1).max(3) }),
  z.object({ status: z.literal('declined'), reason: z.string().optional() }),
  z.object({ status: z.literal('booked'), bookedSlot: isoUtc }),
  z.object({ status: z.literal('emergency'), message: z.string() }),
]);

const detailAnswersSchema = z.object({
  location: z.string(),
  duration: z.string(),
  recentChanges: z.string(),
});

const proDetailActiveSchema = z.object({
  id: z.string().min(1),
  createdAt: isoUtc,
  status: z.enum(['new', 'info_requested', 'accepted', 'declined', 'booked']),
  urgency: z.enum(['urgent', 'soon', 'monitor']),
  likelyIssue: z.string(),
  trade: z.string(),
  confidence: z.number().min(0).max(1),
  costRangeLow: z.number(),
  costRangeHigh: z.number(),
  jobBrief: z.string(),
  followUpQuestions: z.tuple([z.string(), z.string()]),
  answers: detailAnswersSchema,
  infoRequests: z.array(z.object({ question: z.string(), askedAt: isoUtc })),
  replies: z.array(z.object({ text: z.string(), at: isoUtc })),
  offeredSlots: z.array(isoUtc).optional(),
  bookedSlot: isoUtc.optional(),
  declineReason: z.string().optional(),
  photos: z.array(z.string()),
});

const proDetailEmergencySchema = z.object({
  id: z.string().min(1),
  createdAt: isoUtc,
  status: z.literal('emergency'),
  urgency: z.literal('emergency'),
  likelyIssue: z.string(),
  answers: detailAnswersSchema,
  emergencyNote: z.string(),
});

/** Both Pro detail shapes (Requirements 5.3 and 5.10). */
export const proJobDetailSchema = z.union([proDetailEmergencySchema, proDetailActiveSchema]);

/** `GET /api/pro/jobs` response: ProJobListItem[] (Requirement 4.5). */
export const proJobsResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string().min(1),
      createdAt: isoUtc,
      urgency: urgencySchema,
      trade: z.string().nullable(),
      location: z.string(),
      status: statusSchema,
    }),
  ),
});

export const actionResponseSchema = z.object({ status: statusSchema });

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  status: statusSchema.optional(),
});
