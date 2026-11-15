import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { errorBody, noStoreJson } from '@/lib/http/responses';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { runProAction } from '@/lib/jobs/proAction';
import { askInfoBodySchema } from '@/lib/validation/jobSchema';

export const runtime = 'nodejs';

const REPLY_LIMIT = 5;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return runProAction<{ question: string }>({
    request,
    params,
    action: 'ask_info',
    parseBody: (raw) => {
      const parsed = askInfoBodySchema.safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data };
      return { ok: false, message: ERROR_MESSAGES.INVALID_REQUEST };
    },
    // The schema already trims the question.
    buildPatch: (body) => ({ action: 'ask_info', question: body.question }),
    precheck: (job) =>
      job.replyCount >= REPLY_LIMIT
        ? noStoreJson(409, errorBody('REPLY_LIMIT_REACHED', ERROR_MESSAGES.REPLY_LIMIT_REACHED))
        : null,
  });
}
