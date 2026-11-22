import type { ChatMessage } from '@/types/chat';
import type { JobRecord } from '@/types/job';

/** infoRequests -> `q-<i>` (side tradesperson, sentAt = askedAt); replies -> `r-<i>` (side homeowner, sentAt = at). */
export function legacyToMessages(job: Pick<JobRecord, 'infoRequests' | 'replies'>): ChatMessage[] {
  const questions: ChatMessage[] = (job.infoRequests ?? []).map((r, i) => ({
    id: `q-${i}`,
    side: 'tradesperson',
    text: r.question,
    sentAt: r.askedAt,
    legacy: true,
  }));
  const replies: ChatMessage[] = (job.replies ?? []).map((r, i) => ({
    id: `r-${i}`,
    side: 'homeowner',
    text: r.text,
    sentAt: r.at,
    legacy: true,
  }));
  return [...questions, ...replies];
}

/**
 * Sort key: (sentAt, group, index) with group 0 = legacy question, 1 = legacy reply,
 * 2 = chat message. index is the array index, or the seq for a chat message.
 */
export function chatSortKey(m: ChatMessage): [string, number, number] {
  const group = m.id.startsWith('q-') ? 0 : m.id.startsWith('r-') ? 1 : 2;
  const parsed = Number.parseInt(m.id.slice(2), 10);
  return [m.sentAt, group, Number.isFinite(parsed) ? parsed : 0];
}

function compareKeys(a: [string, number, number], b: [string, number, number]): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/** Merges by id (a later copy of the same id is ignored) and sorts by chatSortKey. Stable. */
export function mergeThread(
  existing: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const seen = new Set<string>();
  const merged: ChatMessage[] = [];
  for (const m of [...existing, ...incoming]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  // Array.prototype.sort is stable (ES2019), so equal keys keep input order.
  return merged.sort((a, b) => compareKeys(chatSortKey(a), chatSortKey(b)));
}
