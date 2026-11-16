import { CostRange } from '@/components/results/CostRange';
import { JobBrief } from '@/components/results/JobBrief';
import { BODY, CARD, HEADING } from '@/components/ui/styles';
import { formatConfidence } from '@/lib/utils/formatConfidence';
import type { ProJobDetailActive } from '@/types/job';

export interface JobFactsProps {
  job: Pick<
    ProJobDetailActive,
    | 'likelyIssue'
    | 'trade'
    | 'confidence'
    | 'costRangeLow'
    | 'costRangeHigh'
    | 'jobBrief'
    | 'urgency'
    | 'followUpQuestions'
    | 'answers'
  >;
}

const NOT_ANSWERED = 'Not answered';

function answerText(value: string): string {
  return value.trim() === '' ? NOT_ANSWERED : value;
}

/** Read-only facts for a non-emergency job. Never renders DIY steps. */
export function JobFacts({ job }: JobFactsProps) {
  const { likelyIssue, trade, confidence, costRangeLow, costRangeHigh, jobBrief, urgency, followUpQuestions, answers } = job;
  const answerRows: Array<[string, string]> = [
    ['Where in the home', answers.location],
    ['How long', answers.duration],
    ['Anything else', answers.recentChanges],
  ];

  return (
    <div className="space-y-4">
      <section aria-label="Job facts" className={`${CARD} space-y-4`}>
        <div>
          <h2 className={HEADING}>Likely issue</h2>
          <p className={`${BODY} whitespace-pre-wrap break-words`}>{likelyIssue}</p>
        </div>
        <div>
          <h2 className={HEADING}>Trade</h2>
          <p className={`${BODY} break-words`}>{trade}</p>
        </div>
        <div>
          <h2 className={HEADING}>AI confidence in this diagnosis</h2>
          <p className={BODY}>{formatConfidence(confidence)}</p>
        </div>
      </section>

      <CostRange costRangeLow={costRangeLow} costRangeHigh={costRangeHigh} urgency={urgency} />
      <JobBrief jobBrief={jobBrief} urgency={urgency} />

      <section aria-label="Homeowner answers" className={`${CARD} space-y-4`}>
        {answerRows.map(([label, value]) => (
          <div key={label}>
            <h2 className={HEADING}>{label}</h2>
            <p className={`${BODY} whitespace-pre-wrap break-words`}>{answerText(value)}</p>
          </div>
        ))}
      </section>

      <section aria-label="Follow-up questions" className={CARD}>
        <h2 className={HEADING}>Questions that could help</h2>
        <ul className={`mt-1 list-disc space-y-1 pl-5 ${BODY}`}>
          {followUpQuestions.map((q, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {q}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
