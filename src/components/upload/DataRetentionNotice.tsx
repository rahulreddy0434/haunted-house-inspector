'use client';

import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';

export const DATA_SHARING_NOTICE_TEXT =
  'Your photos, answers and messages are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days.';

interface DataRetentionNoticeProps {
  /** Called once, the first time at least 90% of the notice is visible. */
  onVisible: () => void;
}

export function DataRetentionNotice({ onVisible }: DataRetentionNoticeProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const onVisibleRef = useRef(onVisible);
  const hasFiredRef = useRef(false);

  // Keep the latest callback without re-creating the observer.
  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const fire = () => {
      if (hasFiredRef.current) return;
      hasFiredRef.current = true;
      onVisibleRef.current();
    };

    if (typeof IntersectionObserver === 'undefined') {
      fire();
      return;
    }

    const element = sectionRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold: 0.9 },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <Card
      as="section"
      tone="bare"
      ref={sectionRef}
      aria-labelledby="data-retention-heading"
      className="flex gap-3 rounded-card border border-normal-notice-border bg-normal-notice p-4 text-normal-text haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text"
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px shrink-0 text-normal-accent haunted:text-haunted-accent"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          id="data-retention-heading"
          className="text-[15px] font-semibold text-normal-text haunted:text-haunted-accent"
        >
          Before you send
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-[21px]">
          <li>{DATA_SHARING_NOTICE_TEXT}</li>
          <li>
            If you choose a video, we never upload the video itself. We only send
            a few still pictures taken from it.
          </li>
        </ul>
      </div>
    </Card>
  );
}
