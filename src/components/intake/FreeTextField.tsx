'use client';

import { BODY, ERROR_TEXT, FIELD, MUTED } from '@/components/ui/styles';

export interface FreeTextFieldProps {
  label: string;
  hint?: string;
  example?: string;
  value: string;
  onChange: (v: string) => void;
  /** The true limit for this box. */
  limit: number;
  /** Textarea when true, single-line input otherwise. */
  multiline?: boolean;
  required?: boolean;
  error?: string | null;
  id: string;
}

export function FreeTextField({
  label,
  hint,
  example,
  value,
  onChange,
  limit,
  multiline,
  required,
  error,
  id,
}: FreeTextFieldProps) {
  const hintId = `${id}-hint`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const overLimit = value.length > limit;
  const describedBy = [hint || example ? hintId : null, countId, error ? errorId : null]
    .filter(Boolean)
    .join(' ');
  const fieldClass = `block min-h-11 w-full rounded-lg px-3 py-2 text-base ${FIELD}`;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={`${BODY} block font-medium`}>
        {label}
        {required ? ' (required)' : ''}
      </label>
      {(hint || example) && (
        <p id={hintId} className={`mt-1 ${MUTED}`}>
          {hint}
          {hint && example ? ' ' : ''}
          {example ? `For example: ${example}` : ''}
        </p>
      )}
      {multiline ? (
        <textarea
          id={id}
          value={value}
          maxLength={limit}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`mt-2 ${fieldClass}`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          maxLength={limit}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`mt-2 ${fieldClass}`}
        />
      )}
      <p id={countId} className={`mt-1 ${MUTED}`}>
        {value.length}/{limit}
        {overLimit ? ` Only the first ${limit} characters will be sent.` : ''}
      </p>
      <div id={errorId} role="alert" className="mt-1">
        {error && <p className={`text-sm font-medium ${ERROR_TEXT}`}>{error}</p>}
      </div>
    </div>
  );
}
