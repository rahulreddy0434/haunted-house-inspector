import type { UrgencyLevel } from "@/types/inspection";

export interface IssueSummaryProps {
  likelyIssue: string;
  trade: string;
  followUpQuestions: [string, string];
  diySteps: string[];
  urgency: UrgencyLevel;
}

const HEADING =
  "text-sm font-semibold uppercase tracking-wide text-slate-600 haunted:text-slate-300";
const BODY = "text-base text-slate-900 haunted:text-slate-100";
const LIST = "mt-1 list-disc space-y-1 pl-5 text-base text-slate-900 haunted:text-slate-100";

export function IssueSummary({
  likelyIssue,
  trade,
  followUpQuestions,
  diySteps,
  urgency,
}: IssueSummaryProps) {
  const showDiy = urgency !== "emergency" && diySteps.length > 0;

  return (
    <section
      aria-label="Issue summary"
      className="space-y-4 rounded-lg border border-slate-300 bg-white p-4 haunted:border-slate-600 haunted:bg-slate-900"
    >
      <div>
        <h2 className={HEADING}>Likely issue</h2>
        <p className={BODY}>{likelyIssue}</p>
      </div>

      <div>
        <h2 className={HEADING}>Who to call</h2>
        <p className={BODY}>{trade}</p>
      </div>

      <div>
        <h2 className={HEADING}>Questions that could help</h2>
        <ul className={LIST}>
          {followUpQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>

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
    </section>
  );
}
