'use client';

import { useId } from 'react';
import { BODY, ERROR_TEXT, SECONDARY_BUTTON } from '@/components/ui/styles';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  /** The question. Names the group. */
  legend: string;
  /** Shared by all radios. */
  name: string;
  mode: 'single' | 'multiple';
  options: readonly ChipOption<T>[];
  /** One item at most when mode is 'single'. */
  selected: readonly T[];
  /** Single: choose. Multiple: toggle. */
  onSelect: (value: T) => void;
  /** Single only: shows a "Clear" button when something is selected. */
  onClear?: () => void;
  required?: boolean;
  /** Message text, shown in a role="alert" slot. */
  error?: string | null;
  /** Lets the caller focus the first control. */
  firstInputId?: string;
}

const CHIP_LABEL = [
  'inline-flex min-h-11 min-w-11 max-w-full cursor-pointer items-center gap-2 rounded-lg border px-4 py-2',
  'whitespace-normal break-words text-left text-base',
  'border-slate-500 bg-white text-slate-900 hover:bg-slate-100',
  'peer-checked:border-blue-800 peer-checked:bg-blue-700 peer-checked:text-white',
  'peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2',
  'haunted:border-haunted-border haunted:bg-haunted-field haunted:text-haunted-text haunted:hover:bg-haunted-surface',
  'haunted:peer-checked:border-haunted-accent haunted:peer-checked:bg-haunted-accent haunted:peer-checked:text-haunted-on-accent',
  'haunted:peer-focus-visible:ring-haunted-accent haunted:peer-focus-visible:ring-offset-haunted-bg',
].join(' ');

export function ChipGroup<T extends string>({
  legend,
  name,
  mode,
  options,
  selected,
  onSelect,
  onClear,
  required,
  error,
  firstInputId,
}: ChipGroupProps<T>) {
  const prefix = useId();
  const legendId = `${prefix}-legend`;
  const errorId = `${prefix}-error`;
  const single = mode === 'single';

  return (
    <fieldset
      role={single ? 'radiogroup' : undefined}
      aria-labelledby={legendId}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="min-w-0"
    >
      <legend id={legendId} className={`${BODY} font-medium`}>
        {legend}
        {required ? ' (required)' : ''}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o, i) => {
          const inputId = i === 0 && firstInputId ? firstInputId : `${prefix}-${i}`;
          const isOn = selected.includes(o.value);
          return (
            <div key={o.value} className="max-w-full">
              <input
                id={inputId}
                type={single ? 'radio' : 'checkbox'}
                name={name}
                value={o.value}
                checked={isOn}
                onChange={() => onSelect(o.value)}
                className="peer sr-only focus-visible:outline-none"
              />
              <label htmlFor={inputId} className={CHIP_LABEL}>
                <span aria-hidden="true" className={isOn ? 'font-bold' : 'invisible font-bold'}>
                  ✓
                </span>
                <span>{o.label}</span>
              </label>
            </div>
          );
        })}
      </div>
      {single && onClear && selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className={`mt-2 min-h-11 min-w-11 rounded-lg px-4 py-2 text-sm font-medium ${SECONDARY_BUTTON}`}
        >
          Clear
        </button>
      )}
      <div id={errorId} role="alert" className="mt-2">
        {error && <p className={`text-sm font-medium ${ERROR_TEXT}`}>{error}</p>}
      </div>
    </fieldset>
  );
}
