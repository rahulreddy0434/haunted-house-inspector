import { Card } from "@/components/ui/Card";
import { TradeText } from "@/components/ui/haunted/TradeText";
import type { UrgencyLevel } from "@/types/inspection";

export interface IssueSummaryProps {
  likelyIssue: string;
  trade: string;
  followUpQuestions: [string, string];
  diySteps: string[];
  urgency: UrgencyLevel;
}

const HEADING =
  "text-sm font-semibold uppercase tracking-wide text-slate-600 haunted:text-haunted-muted";
const BODY = "text-base text-slate-900 haunted:text-haunted-text";
const LIST = "mt-1 list-disc space-y-1 pl-5 text-base text-slate-900 haunted:text-haunted-text";

export function IssueSummary({
  likelyIssue,
  trade,
  followUpQuestions,
  diySteps,
  urgency,
}: IssueSummaryProps) {
  const isEmergency = urgency === "emergency";
  const showDiy = !isEmergency && diySteps.length > 0;

  return (
    <Card
      as="section"
      tone="bare"
      aria-label="Issue summary"
      className="space-y-4 rounded-lg border border-slate-300 bg-white p-4 haunted:border-haunted-border haunted:bg-haunted-surface"
    >
      <div>
        <h2 className={HEADING}>Likely issue</h2>
        <p className={BODY}>{likelyIssue}</p>
      </div>

      {!isEmergency && (
        <div>
          <h2 className={HEADING}>Who to call</h2>
          <p className={BODY}>
            <TradeText trade={trade} />
          </p>
        </div>
      )}

      {!isEmergency && (
        <div>
          <h2 className={HEADING}>Questions that could help</h2>
          <ul className={LIST}>
            {followUpQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {showDiy && (
        <div>
          <h2 className={HEADING}>Things you can safely try</h2>
          <ul className={LIST}>
            {diySteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
