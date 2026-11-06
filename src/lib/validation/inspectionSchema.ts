import { z } from 'zod';

export const contextAnswersSchema = z.object({
  location: z.string().trim().min(1, 'Location is required').max(500),
  duration: z.string().max(500).optional().default(''),
  recentChanges: z.string().max(500).optional().default(''),
});

export const bedrockResponseSchema = z
  .object({
    likelyIssue: z.string().max(500),
    trade: z.string().max(100),
    urgency: z.enum(['urgent', 'soon', 'monitor']),
    confidence: z.number().min(0).max(1),
    costRangeLow: z.number().min(0).max(999999),
    costRangeHigh: z.number().min(0).max(999999),
    jobBrief: z.string().max(1000),
    followUpQuestions: z.tuple([z.string().max(200), z.string().max(200)]),
    diySteps: z.array(z.string()),
  })
  .refine((d) => d.costRangeHigh >= d.costRangeLow, {
    message: 'costRangeHigh must be >= costRangeLow',
  });

export const inspectRequestSchema = z.object({
  s3Keys: z.array(z.string().min(1)).min(1).max(5),
  answers: contextAnswersSchema,
});

export type ContextAnswers = z.infer<typeof contextAnswersSchema>;
export type BedrockResponseInput = z.infer<typeof bedrockResponseSchema>;
export type InspectRequest = z.infer<typeof inspectRequestSchema>;
