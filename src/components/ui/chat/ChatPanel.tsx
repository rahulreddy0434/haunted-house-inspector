'use client';

import { useId, useState } from 'react';
import { ChatComposer } from '@/components/ui/chat/ChatComposer';
import { ChatMessageList } from '@/components/ui/chat/ChatMessageList';
import { senderLabel } from '@/components/ui/chat/ChatBubble';
import { ERROR_TEXT, HEADING, MUTED } from '@/components/ui/styles';
import { useChatThread } from '@/hooks/useChatThread';
import type { UseChatThreadOptions } from '@/hooks/useChatThread';
import { chatAccess } from '@/lib/chat/rules';
import type { ChatSide } from '@/types/chat';
import type { JobStatus } from '@/types/job';

export interface ChatPanelProps {
  side: ChatSide;
  jobId: string;
  /** The page's current status; null until the page knows it. */
  status: JobStatus | null;
  onJobChange: UseChatThreadOptions['onJobChange'];
  onEmergency: () => void;
  onUnauthorized?: () => void;
}

export const CHAT_READ_ONLY_TEXT = 'This job is closed to new messages.';
export const CHAT_LOADING_TEXT = 'Loading messages…';
export const CHAT_CHECK_FAILED_TEXT = 'We could not check for new messages. We will try again.';

export function ChatPanel({
  side,
  jobId,
  status,
  onJobChange,
  onEmergency,
  onUnauthorized,
}: ChatPanelProps) {
  const headingId = useId();
  const thread = useChatThread({ side, jobId, status, onJobChange, onEmergency, onUnauthorized });

  // Ids present when the first load finished. They are never announced.
  const [baseline, setBaseline] = useState<ReadonlySet<string> | null>(null);
  if (thread.loaded && baseline === null) {
    setBaseline(new Set(thread.messages.map((m) => m.id)));
  }

  const access = status === null ? null : chatAccess(status);
  if (access === 'closed') return null;

  const ready = access !== null && thread.loaded;
  const announced = baseline
    ? thread.messages.filter((m) => m.side !== side && !baseline.has(m.id))
    : [];

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className={HEADING}>
        Messages
      </h2>
      {ready ? (
        <>
          <ChatMessageList messages={thread.messages} viewerSide={side} />
          {thread.checkFailed ? (
            <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
              {CHAT_CHECK_FAILED_TEXT}
            </p>
          ) : null}
          {access === 'open' ? (
            <ChatComposer onSend={thread.send} sending={thread.sending} error={thread.sendError} />
          ) : (
            <p className={MUTED}>{CHAT_READ_ONLY_TEXT}</p>
          )}
        </>
      ) : (
        <p role="status" className={MUTED}>
          {CHAT_LOADING_TEXT}
        </p>
      )}
      <div aria-live="polite" className="sr-only">
        {announced.map((m) => (
          <p key={m.id}>{`${senderLabel(m.side, side)}: ${m.text}`}</p>
        ))}
      </div>
    </section>
  );
}
