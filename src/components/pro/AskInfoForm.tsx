'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextAreaField';

export const ASK_INFO_LIMIT = 300;

export interface AskInfoFormProps {
  /** True while any pro action request is in flight; disables every control. */
  pending: boolean;
  /** Called with the question text. */
  onSubmit: (question: string) => void;
}

export function AskInfoForm({ pending, onSubmit }: AskInfoFormProps) {
  const [question, setQuestion] = useState('');
  const length = question.length;
  const tooLong = length > ASK_INFO_LIMIT;
  const empty = question.trim().length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || tooLong || empty) return;
    onSubmit(question);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Ask the homeowner a question">
      <TextAreaField
        label="Your question for the homeowner"
        value={question}
        onChange={setQuestion}
        count={`${length} / ${ASK_INFO_LIMIT}`}
        error={tooLong ? `Please keep your question to ${ASK_INFO_LIMIT} characters or fewer.` : null}
        disabled={pending}
      />
      <Button type="submit" variant="secondary" disabled={pending || tooLong || empty}>
        Send question
      </Button>
    </form>
  );
}
