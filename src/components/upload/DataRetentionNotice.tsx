'use client';

import { useEffect, useRef } from 'react';

export const DATA_SHARING_NOTICE_TEXT =
  'Your photos and answers are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days.';

interface DataRetentionNoticeProps {
  /** Called once, the first time at least 90% of the notice is visible. */
  onVisible: () => void;
}

export function DataRetentionNotice({ onVisible }: DataRetentionNoticeProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
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
    <section
      ref={sectionRef}
      aria-labelledby="data-retention-heading"
      className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-base leading-relaxed text-slate-900 haunted:border-purple-700 haunted:bg-haunted-surface haunted:text-purple-50"
    >
      <h2
        id="data-retention-heading"
        className="mb-2 text-lg font-semibold text-slate-900 haunted:text-purple-100"
      >
        What happens to your upload
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>{DATA_SHARING_NOTICE_TEXT}</li>
        <li>
          If you choose a video, we never upload the video itself. We only send
          a few still pictures taken from it.
        </li>
      </ul>
    </section>
  );
}
