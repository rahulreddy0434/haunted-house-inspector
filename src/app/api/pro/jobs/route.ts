import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { queryRecentJobs } from '@/lib/aws/jobs';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { toProListItem } from '@/lib/jobs/views';
import { requirePro } from '@/lib/pro/proAuth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const nowMs = Date.now();
  const guard = requirePro(request, nowMs);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    // Any cursor or page query parameter is deliberately ignored.
    const items = await queryRecentJobs(nowMs);
    return noStoreJson(200, { jobs: items.map(toProListItem) });
  } catch (error: unknown) {
    console.error('Failed to load pro jobs', error instanceof Error ? error.name : 'UnknownError');
    return noStoreJson(500, errorBody('LOAD_FAILED', ERROR_MESSAGES.LOAD_FAILED.list));
  }
}
