import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/aws/jobs';
import { getDownloadPresignedUrl } from '@/lib/aws/s3';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { effectiveStatus, toProDetail } from '@/lib/jobs/views';
import { requirePro } from '@/lib/pro/proAuth';
import { jobIdSchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

const PHOTO_URL_EXPIRY_SECONDS = 900;

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const nowMs = Date.now();
  const guard = requirePro(request, nowMs);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await context.params;
  if (!jobIdSchema.safeParse(id).success) {
    return notFound();
  }

  try {
    const lookup = await getJob(id);
    switch (lookup.kind) {
      case 'missing':
      case 'legacy':
        return notFound();
      case 'invalid':
        return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
      case 'found':
        break;
    }

    const job = lookup.job;
    // Emergency Jobs get no photos and no S3 call at all.
    if (effectiveStatus(job) === 'emergency' || job.urgency === 'emergency') {
      return noStoreJson(200, toProDetail(job, []));
    }

    const settled = await Promise.allSettled(
      job.s3Keys.map((key) => getDownloadPresignedUrl(key, PHOTO_URL_EXPIRY_SECONDS)),
    );
    const photos: string[] = [];
    let failedName: string | null = null;
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        photos.push(result.value);
      } else if (failedName === null) {
        failedName = result.reason instanceof Error ? result.reason.name : 'UnknownError';
      }
    }
    if (failedName !== null) {
      console.error('Failed to sign a photo URL', failedName);
    }
    return noStoreJson(200, toProDetail(job, photos));
  } catch (error: unknown) {
    console.error('Failed to load pro job', error instanceof Error ? error.name : 'UnknownError');
    return noStoreJson(500, errorBody('LOAD_FAILED', ERROR_MESSAGES.LOAD_FAILED.detail));
  }
}
