import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { runProAction } from '@/lib/jobs/proAction';
import { declineBodySchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return runProAction<{ reason?: string }>({
    request,
    params,
    action: 'decline',
    parseBody: (raw) => {
      const parsed = declineBodySchema.safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data };
      return { ok: false, message: ERROR_MESSAGES.INVALID_REQUEST };
    },
    // The schema already trims; an empty reason is absent, so it is never stored.
    buildPatch: (body) => {
      const trimmed = body.reason?.trim();
      return { action: 'decline', reason: trimmed || undefined };
    },
  });
}
