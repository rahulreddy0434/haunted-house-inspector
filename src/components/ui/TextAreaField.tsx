import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { ERROR_TEXT, FIELD, MUTED } from '@/components/ui/styles';

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'onChange' | 'aria-describedby'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Error text; rendered with role="alert" and linked by aria-describedby. */
  error?: string | null;
  /** Live count text, for example "120 / 500". Linked by aria-describedby. */
  count?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  count,
  className,
  ...rest
}: TextAreaFieldProps) {
  const uid = useId();
  const areaId = `${uid}-field`;
  const countId = `${areaId}-count`;
  const errorId = `${areaId}-error`;
  const describedBy = [count ? countId : null, error ? errorId : null].filter(Boolean).join(' ');
  const classes = ['mt-1 block w-full rounded-lg px-3 py-2 text-base', FIELD, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={areaId} className={`block text-sm font-medium ${MUTED}`}>
        {label}
      </label>
      <textarea
        rows={4}
        {...rest}
        id={areaId}
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
