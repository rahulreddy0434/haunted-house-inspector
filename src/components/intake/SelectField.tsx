'use client';

import { BODY, ERROR_TEXT, FIELD } from '@/components/ui/styles';

export interface SelectFieldProps {
  id: string;
  label: string;
  /** Text of the empty first option. */
  placeholder: string;
  options: readonly string[];
  /** The chosen option, or null for the empty option. */
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
  error?: string | null;
}

export function SelectField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  required,
  error,
}: SelectFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={`${BODY} block font-medium`}>
        {label}
        {required ? ' (required)' : ''}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-2 block min-h-11 w-full rounded-lg px-3 py-2 text-base ${FIELD}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <div id={errorId} role="alert" className="mt-1">
        {error && <p className={`text-sm font-medium ${ERROR_TEXT}`}>{error}</p>}
      </div>
    </div>
  );
}
