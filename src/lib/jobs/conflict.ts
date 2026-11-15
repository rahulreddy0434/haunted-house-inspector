import 'server-only';
import type { NextResponse } from 'next/server';
import { getJob } from '@/lib/aws/jobs';
import { EMERGENCY_MESSAGE, PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { errorBody, noStoreJson } from '@/lib/http/responses';

/**
 * Maps a failed write condition to a response after exactly one strongly
 * consistent re-read. Never retries the write. Bodies carry only fixed copy and
 * the current `status`, never slots or free text (Requirement 6.10).
 */
export async function conflictResponse(
  id: string,
  audience: 'pro' | 'homeowner',
): Promise<NextResponse> {
  let lookup: Awaited<ReturnType<typeof getJob>>;
  try {
    lookup = await getJob(id);
  } catch (error: unknown) {
    console.error('Conflict re-read failed', error instanceof Error ? error.name : 'UnknownError');
    return noStoreJson(500, errorBody('ACTION_FAILED', ERROR_MESSAGES.ACTION_FAILED));
  }

  switch (lookup.kind) {
    case 'found': {
      const status = lookup.job.status;
      if (status === 'emergency') {
        const message = audience === 'pro' ? PRO_EMERGENCY_NOTE : EMERGENCY_MESSAGE;
        return noStoreJson(409, errorBody('JOB_IS_EMERGENCY', message, { status: 'emergency' }));
      }
      return noStoreJson(
        409,
        errorBody('ILLEGAL_TRANSITION', ERROR_MESSAGES.ILLEGAL_TRANSITION, { status }),
      );
    }
    case 'invalid':
      return noStoreJson(500, errorBody('RESULT_INVALID', ERROR_MESSAGES.RESULT_INVALID));
    case 'missing':
    case 'legacy':
      return noStoreJson(404, errorBody('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND));
  }
}
