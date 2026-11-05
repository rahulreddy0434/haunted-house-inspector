import { z } from 'zod';

export const uploadUrlRequestSchema = z.object({
  filename: z.string().min(1, 'filename is required'),
  contentType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
  ]),
  inspectionId: z.string().uuid('inspectionId must be a valid UUID'),
});

export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
