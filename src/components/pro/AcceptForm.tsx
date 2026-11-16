'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { MUTED } from '@/components/ui/styles';

export interface AcceptFormProps {
  /** True while any pro action request is in flight; disables every control. */
  pending: boolean;
  /** Called with the filled slots as ISO strings (UTC, Z suffix), in field order. */
  onSubmit: (slots: string[]) => void;
}

function browserZoneName(): string {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

export function AcceptForm({ pending, onSubmit }: AcceptFormProps) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [third, setThird] = useState('');
  const [zone, setZone] = useState('');

  // Read in an effect so server and client first renders match.
  useEffect(() => {
    setZone(browserZoneName());
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const slots: string[] = [];
    for (const value of [first, second, third]) {
      if (!value) continue;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) continue;
      slots.push(date.toISOString());
    }
    onSubmit(slots);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Accept this job">
      <TextField
        label="First time you can start"
        type="datetime-local"
        value={first}
        onChange={setFirst}
        required
        disabled={pending}
      />
      <TextField
        label="Second time"
        type="datetime-local"
        value={second}
        onChange={setSecond}
        disabled={pending}
      />
      <TextField
        label="Third time"
        type="datetime-local"
        value={third}
        onChange={setThird}
        disabled={pending}
      />
      <p className={MUTED}>
        {zone ? `Times are in your time zone: ${zone}` : 'Times are in your time zone.'}
      </p>
      <Button type="submit" disabled={pending}>
        Accept job
      </Button>
    </form>
  );
}
