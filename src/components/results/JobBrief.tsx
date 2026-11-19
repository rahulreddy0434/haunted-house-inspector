"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { UrgencyLevel } from "@/types/inspection";

export interface JobBriefProps {
  jobBrief: string;
  urgency: UrgencyLevel;
}

type CopyState = "idle" | "copied" | "failed";

/** How long "Copied!" stays visible (requirement: at least 2 seconds). */
const COPIED_DURATION_MS = 2500;

export function JobBrief({ jobBrief, urgency }: JobBriefProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  // Select the text when the manual-copy fallback appears.
  useEffect(() => {
    if (copyState === "failed" && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [copyState]);

  const handleCopy = useCallback(async () => {
    clearTimer();
    let ok = false;
    try {
      const clipboard =
        typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (clipboard && typeof clipboard.writeText === "function") {
        await clipboard.writeText(jobBrief);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!mountedRef.current) return;
    if (ok) {
      setCopyState("copied");
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (mountedRef.current) setCopyState("idle");
      }, COPIED_DURATION_MS);
    } else {
      setCopyState("failed");
    }
  }, [jobBrief, clearTimer]);

  if (urgency === "emergency") return null;

  return (
    <Card
      as="section"
      tone="bare"
      aria-labelledby="job-brief-heading"
      className="rounded-lg border border-gray-300 bg-white p-4 text-gray-900 haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="job-brief-heading" className="text-lg font-semibold">
          Job brief
        </h2>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy job brief"
          className="rounded-md border border-blue-800 bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:border-haunted-accent haunted:bg-haunted-accent haunted:text-haunted-on-accent haunted:hover:bg-haunted-accent-hover haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg"
        >
          Copy
        </button>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-base">{jobBrief}</p>

      <div aria-live="polite" role="status" className="mt-2 text-sm font-medium">
        {copyState === "copied" && (
          <span className="text-green-800 haunted:text-haunted-ok">Copied!</span>
        )}
        {copyState === "failed" && (
          <span className="text-red-800 haunted:text-haunted-error">
            Copying didn&apos;t work. Select the text below and copy it yourself.
          </span>
        )}
      </div>

      {copyState === "failed" && (
        <textarea
          ref={textareaRef}
          readOnly
          rows={6}
          value={jobBrief}
          aria-label="Job brief text to copy"
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full rounded-md border border-gray-500 bg-gray-50 p-2 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg"
        />
      )}
    </Card>
  );
}
