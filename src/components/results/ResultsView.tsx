"use client";
import { useCallback } from "react";
import Link from "next/link";
import { useInspection } from "@/hooks/useInspection";
import { useStatusPolling } from "@/hooks/useStatusPolling";
import { ChatPanel } from "@/components/ui/chat/ChatPanel";
import { viewFromChat } from "@/lib/jobs/views";
import type { BookingData } from "@/types/chat";
import type { InspectionResult } from "@/types/inspection";
import type { JobStatus } from "@/types/job";
import { formatConfidence } from "@/lib/utils/formatConfidence";
import { EmergencyScope } from "@/components/ui/haunted/EmergencyScope";
import { StateText } from "@/components/ui/haunted/StateText";
import { PAGE_TITLE } from "@/components/ui/styles";
import { RESULTS_PAGE_NOTICE } from "@/lib/jobs/copy";
import { emergencyReasonSentence } from "@/lib/emergency/reasons";
import { EmergencyBanner } from "./EmergencyBanner";
import { EmergencyReasonLine } from "./EmergencyReasonLine";
import { UrgencyBadge } from "./UrgencyBadge";
import { IssueSummary } from "./IssueSummary";
import { CostRange } from "./CostRange";
import { JobBrief } from "./JobBrief";
import { StatusPanelBody } from "./StatusPanel";
import { BookingControls } from "./BookingControls";
import { HelpSection } from "@/components/ui/help/HelpSection";
export interface ResultsViewProps {
  id: string;
}
const PAGE = "mx-auto flex w-full max-w-2xl flex-col gap-4 p-6";
const TEXT = "text-slate-900 haunted:text-haunted-text";
const LINK =
  "inline-block rounded-md border border-blue-800 bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg";
function NewInspectionLink() {
  return (
    <div>
      <Link href="/" className={LINK}>
        Start a new inspection
      </Link>
    </div>
  );
}

interface NormalResultProps {
  id: string;
  result: InspectionResult;
  urgency: InspectionResult["urgency"];
  markEmergency: () => void;
}

/**
 * The non-emergency page. It owns the status polling so the status text, the
 * booking controls and the chat panel all read the same `polling.view`.
 * It is mounted only for a non-emergency result, so an emergency result never
 * starts a status request.
 */
function NormalResult({ id, result, urgency, markEmergency }: NormalResultProps) {
  const polling = useStatusPolling(id, { onEmergency: markEmergency });
  const { applyView } = polling;

  const handleJobChange = useCallback(
    (next: { status: Exclude<JobStatus, "emergency">; booking: BookingData }) => {
      applyView(viewFromChat(next.status, next.booking));
    },
    [applyView],
  );
  const handleChatEmergency = useCallback((reasonSentence?: string) => {
    applyView(viewFromChat("emergency", {}, reasonSentence));
  }, [applyView]);

  return (
    <main className={PAGE}>
      <h1 className={`${PAGE_TITLE} break-words`}>Your inspection result</h1>
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
      <StatusPanelBody id={id} polling={polling} hideBooking />
      {polling.gone ? null : (
        <ChatPanel
          side="homeowner"
          jobId={id}
          status={polling.view?.status ?? null}
          onJobChange={handleJobChange}
          onEmergency={handleChatEmergency}
        />
      )}
      <BookingControls id={id} polling={polling} />
      <p className="text-sm text-slate-700 haunted:text-haunted-muted">
        This is a likely diagnosis, not a certain one.
      </p>
      <p className="text-sm text-slate-700 haunted:text-haunted-muted">
        {RESULTS_PAGE_NOTICE}
      </p>
      <NewInspectionLink />
      {polling.view?.status === "emergency" ? null : <HelpSection page="/inspect" jobId={id} />}
    </main>
  );
}

export function ResultsView({ id }: ResultsViewProps) {
  const { result, loading, error, notFound, markEmergency } = useInspection(id);
  if (!result) {
    if (notFound) {
      return (
        <main className={PAGE}>
          <p className={`text-lg font-semibold ${TEXT}`}>Result could not be found</p>
          <NewInspectionLink />
          <HelpSection page="/inspect" jobId={id} />
        </main>
      );
    }
    if (error) {
      return (
        <main className={PAGE}>
          <p role="alert" className="text-base font-medium text-red-800 haunted:text-haunted-error">
            {error}
          </p>
          <NewInspectionLink />
          <HelpSection page="/inspect" jobId={id} />
        </main>
      );
    }
    // loading (or the brief moment before the first load starts)
    void loading;
    return (
      <main className={PAGE}>
        <StateText
          plain="Loading your result…"
          hauntedKey="resultLoading"
          role="status"
          className={TEXT}
        />
      </main>
    );
  }
  const isEmergency = result.urgency === "emergency" || result.isEmergency;
  const urgency = isEmergency ? "emergency" : result.urgency;
  if (isEmergency) {
    return (
      <main className={PAGE}>
        <EmergencyScope />
        <EmergencyBanner urgency="emergency" />
        <EmergencyReasonLine sentence={emergencyReasonSentence(result.emergencyRule)} />
        <h1 className={`${PAGE_TITLE} break-words`}>Your inspection result</h1>
        <div>
          <UrgencyBadge urgency="emergency" />
        </div>
        <IssueSummary
          likelyIssue={result.likelyIssue}
          trade=""
          followUpQuestions={["", ""]}
          diySteps={[]}
          urgency="emergency"
        />
        <NewInspectionLink />
      </main>
    );
  }
  return <NormalResult id={id} result={result} urgency={urgency} markEmergency={markEmergency} />;
}
