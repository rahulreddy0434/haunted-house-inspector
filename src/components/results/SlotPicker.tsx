'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TimeText } from '@/components/ui/TimeText';
import { BODY, ERROR_TEXT, HEADING } from '@/components/ui/styles';

export interface SlotPickerProps {
  /** UTC ISO timestamps offered by the tradesperson. Sorted ascending for display. */
  slots: readonly string[];
  /** True while a booking request is running. Disables the confirm button. */
  booking: boolean;
  /** Called with the selected slot when the user confirms. */
  onConfirm: (slot: string) => void;
  /** Optional error message from the last booking attempt. */
  error?: string | null;
}

const RADIO =
  'h-5 w-5 shrink-0 accent-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:accent-haunted-accent haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

export function SlotPicker({ slots, booking, onConfirm, error }: SlotPickerProps) {
  const name = useId();
  const [picked, setPicked] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...slots].sort((a, b) => Date.parse(a) - Date.parse(b)),
    [slots],
  );

  // Derived: a selection that is no longer offered counts as cleared.
  const selected = picked !== null && sorted.includes(picked) ? picked : null;

  return (
    <fieldset className="space-y-3">
      <legend className={HEADING}>Pick a time</legend>
      <ul className="space-y-2">
        {sorted.map((slot) => {
          const id = `${name}-${slot}`;
          return (
            <li key={slot} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                id={id}
                name={name}
                value={slot}
                checked={selected === slot}
                onChange={() => setPicked(slot)}
                className={RADIO}
              />
              <label htmlFor={id} className={`${BODY} cursor-pointer`}>
                <TimeText iso={slot} />
              </label>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {error}
        </p>
      ) : null}
      <Button
        disabled={selected === null || booking}
        onClick={() => {
          if (selected !== null) onConfirm(selected);
        }}
      >
        Confirm this time
      </Button>
    </fieldset>
  );
}
