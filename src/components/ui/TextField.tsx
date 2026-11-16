import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { ERROR_TEXT, FIELD, MUTED } from '@/components/ui/styles';

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'aria-describedby'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Error text; rendered with role="alert" and linked by aria-describedby. */
  error?: string | null;
  /** Live count text, for example "3 / 200". Linked by aria-describedby. */
  count?: string;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  count,
  className,
  ...rest
}: TextFieldProps) {
  const uid = useId();
  const inputId = `${uid}-field`;
  const countId = `${inputId}-count`;
  const errorId = `${inputId}-error`;
  const describedBy = [count ? countId : null, error ? errorId : null].filter(Boolean).join(' ');
  const classes = ['mt-1 block min-h-11 w-full rounded-lg px-3 py-2 text-base', FIELD, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={inputId} className={`block text-sm font-medium ${MUTED}`}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={classes}
      />
      {count ? (
        <p id={countId} className={`mt-1 ${MUTED}`}>
          {count}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={`mt-1 text-sm ${ERROR_TEXT}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
