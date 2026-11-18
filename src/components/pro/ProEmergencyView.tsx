import { BODY, CARD, HEADING, NOTE_BOX } from '@/components/ui/styles';
import { PRO_EMERGENCY_NOTE } from '@/lib/emergency/messages';
import type { ProJobDetailEmergency } from '@/types/job';

export interface ProEmergencyViewProps {
  job: Pick<ProJobDetailEmergency, 'likelyIssue' | 'answers'>;
}

const NOT_ANSWERED = 'Not answered';

function answerText(value: string): string {
  return value.trim() === '' ? NOT_ANSWERED : value;
}

/** Read-only emergency view: note, likely issue and answers. No controls, trade, photos, cost or brief. */
export function ProEmergencyView({ job }: ProEmergencyViewProps) {
  const { likelyIssue, answers } = job;
  const answerRows: Array<[string, string]> = [
    ['Where in the home', answers.location],
    ['How long', answers.duration],
    ['Anything else', answers.recentChanges],
  ];

  return (
    <div className="space-y-4">
      <p className={`${NOTE_BOX} whitespace-pre-wrap break-words font-semibold`}>{PRO_EMERGENCY_NOTE}</p>

      <section aria-label="Job facts" className={`${CARD} space-y-4`}>
        <div>
          <h2 className={HEADING}>Likely issue</h2>
          <p className={`${BODY} whitespace-pre-wrap break-words`}>{likelyIssue}</p>
        </div>
        {answerRows.map(([label, value]) => (
          <div key={label}>
            <h2 className={HEADING}>{label}</h2>
            <p className={`${BODY} whitespace-pre-wrap break-words`}>{answerText(value)}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
