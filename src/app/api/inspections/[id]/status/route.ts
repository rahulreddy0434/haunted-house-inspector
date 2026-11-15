import 'server-only';

import type { NextResponse } from 'next/server';
import { getJob, type JobLookup } from '@/lib/aws/jobs';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { toHomeownerStatusView } from '@/lib/jobs/views';
import { jobIdSchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

function notFound(): NextResponse {
  return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  // A malformed id is indistinguishable from an unknown one, to avoid probing.
  if (!jobIdSchema.safeParse(id).success) {
    return notFound();
  }

  let lookup: JobLookup;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    console.error('Failed to load job status', error instanceof Error ? error.name : 'UnknownError');
    return noStoreJson(500, errorBody('LOAD_FAILED', ERROR_MESSAGES.LOAD_FAILED.status));
  }

  if (lookup.kind === 'missing' || lookup.kind === 'legacy') {
    return notFound();
  }
  if (lookup.kind === 'invalid') {
    console.error('Stored job failed validation');
    return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
  }

  return noStoreJson(200, toHomeownerStatusView(lookup.job));
}
