import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';
import { runProAction } from '@/lib/jobs/proAction';
import { SLOT_RULE_MESSAGES, slotsSchema, type SlotRule } from '@/lib/jobs/timeSlots';
import type { TimeSlot } from '@/types/job';

export const runtime = 'nodejs';

function isSlotRule(message: string): message is SlotRule {
  return Object.prototype.hasOwnProperty.call(SLOT_RULE_MESSAGES, message);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return runProAction<{ slots: TimeSlot[] }>({
    request,
    params,
    action: 'accept',
    parseBody: (raw, nowMs) => {
      const parsed = z.object({ slots: slotsSchema(nowMs) }).safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data };
      const first = parsed.error.issues[0]?.message ?? '';
      return {
        ok: false,
        message: isSlotRule(first) ? SLOT_RULE_MESSAGES[first] : ERROR_MESSAGES.INVALID_REQUEST,
      };
    },
    buildPatch: (body) => ({ action: 'accept', slots: body.slots }),
  });
}
