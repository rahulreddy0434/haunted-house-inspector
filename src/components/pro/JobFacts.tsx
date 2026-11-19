import { CostRange } from '@/components/results/CostRange';
import { JobBrief } from '@/components/results/JobBrief';
import { TradeText } from '@/components/ui/haunted/TradeText';
import { Card } from '@/components/ui/Card';
import { BODY, HEADING } from '@/components/ui/styles';
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
      <Card as="section" aria-label="Job facts" className="space-y-4">
        <div>
          <h2 className={HEADING}>Likely issue</h2>
          <p className={`${BODY} whitespace-pre-wrap break-words`}>{likelyIssue}</p>
        </div>
        <div>
          <h2 className={HEADING}>Trade</h2>
          <p className={`${BODY} break-words`}><TradeText trade={trade} /></p>
        </div>
        <div>
          <h2 className={HEADING}>AI confidence in this diagnosis</h2>
          <p className={BODY}>{formatConfidence(confidence)}</p>
        </div>
      </Card>

      <CostRange costRangeLow={costRangeLow} costRangeHigh={costRangeHigh} urgency={urgency} />
      <JobBrief jobBrief={jobBrief} urgency={urgency} />

      <Card as="section" aria-label="Homeowner answers" className="space-y-4">
        {answerRows.map(([label, value]) => (
          <div key={label}>
            <h2 className={HEADING}>{label}</h2>
            <p className={`${BODY} whitespace-pre-wrap break-words`}>{answerText(value)}</p>
          </div>
        ))}
      </Card>

      <Card as="section" aria-label="Follow-up questions">
        <h2 className={HEADING}>Questions that could help</h2>
        <ul className={`mt-1 list-disc space-y-1 pl-5 ${BODY}`}>
          {followUpQuestions.map((q, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {q}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
