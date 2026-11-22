import { transition } from '@/lib/jobs/transition';
import type { ChatAccess, ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';

/** open for new, info_requested, accepted, booked; read_only for declined; closed for emergency. */
export function chatAccess(status: JobStatus): ChatAccess {
  if (status === 'emergency') return 'closed';
  if (status === 'declined') return 'read_only';
  return 'open';
}

export type SendStatusResult =
  | { ok: true; next: JobStatus; changed: boolean }
  | { ok: false; reason: 'ILLEGAL_TRANSITION' | 'JOB_IS_EMERGENCY' };

/** Status after one message from `side`. Only the first Pro message and the first reply change it. */
export function statusAfterSend(status: JobStatus, side: ChatSide): SendStatusResult {
  const access = chatAccess(status);
  if (access === 'closed') return { ok: false, reason: 'JOB_IS_EMERGENCY' };
  if (access === 'read_only') return { ok: false, reason: 'ILLEGAL_TRANSITION' };

  let next: JobStatus = status;
  if (side === 'tradesperson' && status === 'new') {
    const t = transition(status, 'ask_info');
    if (!t.ok) return { ok: false, reason: t.reason };
    next = t.next;
  } else if (side === 'homeowner' && status === 'info_requested') {
    const t = transition(status, 'reply');
    if (!t.ok) return { ok: false, reason: t.reason };
    next = t.next;
  }
  return { ok: true, next, changed: next !== status };
}
