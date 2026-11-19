import { Card } from '@/components/ui/Card';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, HEADING } from '@/components/ui/styles';
import type { InfoRequest, ReplyEntry } from '@/types/job';

export interface JobHistoryProps {
  infoRequests: InfoRequest[];
  replies: ReplyEntry[];
}

interface HistoryEntry {
  kind: 'question' | 'reply';
  label: string;
  text: string;
  at: string;
}

function buildEntries(infoRequests: InfoRequest[], replies: ReplyEntry[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...infoRequests.map((r): HistoryEntry => ({ kind: 'question', label: 'You asked', text: r.question, at: r.askedAt })),
    ...replies.map((r): HistoryEntry => ({ kind: 'reply', label: 'Homeowner replied', text: r.text, at: r.at })),
  ];
  // Array.prototype.sort is stable, so equal times keep questions (listed first) ahead of replies.
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Questions and replies in ascending time order. Plain text only. */
export function JobHistory({ infoRequests, replies }: JobHistoryProps) {
  const entries = buildEntries(infoRequests, replies);
  if (entries.length === 0) return null;

  return (
    <Card as="section" aria-label="Conversation">
      <h2 className={HEADING}>Conversation</h2>
      <ul className="mt-2 space-y-3">
        {entries.map((e, i) => (
          <li key={`${e.kind}-${i}`}>
            <p className={HEADING}>
              {e.label} · <TimeText iso={e.at} />
            </p>
            <p className={`${BODY} whitespace-pre-wrap break-words`}>{e.text}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
