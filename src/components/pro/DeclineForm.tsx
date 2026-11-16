'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextAreaField';

export const DECLINE_REASON_LIMIT = 200;

export interface DeclineFormProps {
  /** True while any pro action request is in flight; disables every control. */
  pending: boolean;
  /** Called with the reason text (may be empty). */
  onSubmit: (reason: string) => void;
}

export function DeclineForm({ pending, onSubmit }: DeclineFormProps) {
  const [reason, setReason] = useState('');
  const length = reason.length;
  const tooLong = length > DECLINE_REASON_LIMIT;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || tooLong) return;
    onSubmit(reason);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Decline this job">
      <TextAreaField
        label="Reason (optional)"
        value={reason}
        onChange={setReason}
        count={`${length} / ${DECLINE_REASON_LIMIT}`}
        error={tooLong ? `Please keep the reason to ${DECLINE_REASON_LIMIT} characters or fewer.` : null}
        disabled={pending}
      />
      <Button type="submit" variant="secondary" disabled={pending || tooLong}>
        Decline job
      </Button>
    </form>
  );
}
