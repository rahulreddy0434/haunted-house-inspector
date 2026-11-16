'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { MUTED } from '@/components/ui/styles';
import { REPLY_RETENTION_NOTE, REPLY_TOO_LONG_MESSAGE } from '@/lib/jobs/copy';

export const REPLY_MAX_LENGTH = 500;

export interface ReplyBoxProps {
  /** Typed text. Owned by the parent so it survives errors. */
  value: string;
  onChange: (value: string) => void;
  /** Called on submit with the text as typed. The parent decides the outcome. */
  onSubmit: () => void;
  /** True while a request is in progress: disables the box and the button. */
  sending: boolean;
  /** Server or network error text, shown in role="alert". */
  error?: string | null;
}

export function ReplyBox({ value, onChange, onSubmit, sending, error }: ReplyBoxProps) {
  const length = value.length;
  const tooLong = length > REPLY_MAX_LENGTH;
  const count = tooLong ? `${length}/${REPLY_MAX_LENGTH}, too long` : `${length}/${REPLY_MAX_LENGTH}`;
  const shownError = tooLong ? REPLY_TOO_LONG_MESSAGE : (error ?? null);
  const canSend = value.trim().length > 0 && !sending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextAreaField
        label="Your reply"
        value={value}
        onChange={onChange}
        count={count}
        error={shownError}
        disabled={sending}
      />
      <p className={`text-sm ${MUTED}`}>{REPLY_RETENTION_NOTE}</p>
      <Button type="submit" disabled={!canSend}>
        Send reply
      </Button>
    </form>
  );
}
