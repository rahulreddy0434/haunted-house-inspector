'use client';

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ERROR_TEXT, FIELD, MUTED } from '@/components/ui/styles';
import { REPLY_TOO_LONG_MESSAGE } from '@/lib/jobs/copy';

export const CHAT_TEXT_MAX = 500;

export interface ChatComposerProps {
  /** Resolves with the outcome. Only 'sent' clears the text. */
  onSend: (text: string) => Promise<'sent' | 'refused' | 'emergency'>;
  /** True while a send is in progress. Disables the button, never the box. */
  sending: boolean;
  /** Limit or failure text from the server, shown in role="alert". */
  error: string | null;
}

export function ChatComposer({ onSend, sending, error }: ChatComposerProps) {
  const uid = useId();
  const areaId = `${uid}-message`;
  const countId = `${areaId}-count`;
  const errorId = `${areaId}-error`;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');

  const length = text.length;
  const tooLong = text.trim().length > CHAT_TEXT_MAX;
  const empty = text.trim().length === 0;
  const shownError = tooLong ? REPLY_TOO_LONG_MESSAGE : error;
  const count = tooLong ? `${length}/${CHAT_TEXT_MAX}, too long` : `${length}/${CHAT_TEXT_MAX}`;
  const describedBy = shownError ? `${countId} ${errorId}` : countId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || empty || tooLong) return;
    const outcome = await onSend(text);
    if (outcome === 'sent') {
      setText('');
      areaRef.current?.focus();
    }
    // After a refusal the text and the focus stay where they are.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor={areaId} className={`block text-sm font-medium ${MUTED}`}>
          Your message
        </label>
        <textarea
          ref={areaRef}
          id={areaId}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={describedBy}
          className={`mt-1 block min-h-11 w-full rounded-lg px-3 py-2 text-base ${FIELD}`}
        />
        <p id={countId} className={`mt-1 ${MUTED}`}>
          {count}
        </p>
        {shownError ? (
          <p id={errorId} role="alert" className={`mt-1 text-sm ${ERROR_TEXT}`}>
            {shownError}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={sending || empty || tooLong}>
        {sending ? 'Sending…' : 'Send'}
      </Button>
    </form>
  );
}
