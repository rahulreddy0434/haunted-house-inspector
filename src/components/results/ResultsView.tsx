"use client";

import Link from "next/link";
import { useInspection } from "@/hooks/useInspection";
import { formatConfidence } from "@/lib/utils/formatConfidence";
import { EmergencyBanner } from "./EmergencyBanner";
import { UrgencyBadge } from "./UrgencyBadge";
import { IssueSummary } from "./IssueSummary";
import { CostRange } from "./CostRange";
import { JobBrief } from "./JobBrief";

export interface ResultsViewProps {
  id: string;
}

const PAGE = "mx-auto flex w-full max-w-2xl flex-col gap-4 p-6";
const TEXT = "text-slate-900 haunted:text-slate-100";
const LINK =
  "inline-block rounded-md border border-blue-800 bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-purple-300 haunted:bg-purple-700 haunted:hover:bg-purple-600";

function NewInspectionLink() {
  return (
    <div>
      <Link href="/" className={LINK}>
        Start a new inspection
      </Link>
    </div>
  );
}

export function ResultsView({ id }: ResultsViewProps) {
  const { result, loading, error, notFound } = useInspection(id);

  if (!result) {
    if (notFound) {
      return (
        <main className={PAGE}>
          <p className={`text-lg font-semibold ${TEXT}`}>Result could not be found</p>
          <NewInspectionLink />
        </main>
      );
    }
    if (error) {
      return (
        <main className={PAGE}>
          <p role="alert" className="text-base font-medium text-red-800 haunted:text-red-300">
            {error}
          </p>
          <NewInspectionLink />
        </main>
      );
    }
    // loading (or the brief moment before the first load starts)
    void loading;
    return (
      <main className={PAGE}>
        <p role="status" className={TEXT}>
          Loading your result…
        </p>
      </main>
    );
  }

  const isEmergency = result.urgency === "emergency" || result.isEmergency;
  const urgency = isEmergency ? "emergency" : result.urgency;

  if (isEmergency) {
    return (
      <main className={PAGE}>
        <EmergencyBanner urgency="emergency" />
        <h1 className={`text-2xl font-bold ${TEXT}`}>Your inspection result</h1>
        <div>
          <UrgencyBadge urgency="emergency" />
        </div>
        <IssueSummary
          likelyIssue={result.likelyIssue}
          trade={result.trade}
          followUpQuestions={result.followUpQuestions}
          diySteps={[]}
          urgency="emergency"
        />
      </main>
    );
  }

  return (
    <main className={PAGE}>
      <h1 className={`text-2xl font-bold ${TEXT}`}>Your inspection result</h1>
      <div>
        <UrgencyBadge urgency={urgency} />
      </div>
      <IssueSummary
        likelyIssue={result.likelyIssue}
        trade={result.trade}
        followUpQuestions={result.followUpQuestions}
        diySteps={result.diySteps}
        urgency={urgency}
      />
      <p className={TEXT}>
        <span>AI confidence in this diagnosis</span>:{" "}
        <strong>{formatConfidence(result.confidence)}</strong>
      </p>
      <CostRange
        costRangeLow={result.costRangeLow}
        costRangeHigh={result.costRangeHigh}
        urgency={urgency}
      />
      <JobBrief jobBrief={result.jobBrief} urgency={urgency} />
      <p className="text-sm text-slate-700 haunted:text-slate-300">
        This is a likely diagnosis, not a certain one.
      </p>
      <p className="text-sm text-slate-700 haunted:text-slate-300">
        Anyone with this page&apos;s link can view it. Your photos are deleted after 30 days.
      </p>
      <NewInspectionLink />
    </main>
  );
}
