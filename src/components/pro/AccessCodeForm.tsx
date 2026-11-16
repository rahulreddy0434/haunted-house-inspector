'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ERROR_MESSAGES } from '@/lib/jobs/copy';

export interface AccessCodeFormProps {
  /** Called after a 200 response. The field has already been cleared. */
  onSuccess: () => void;
  /** Called after a 503 PRO_DISABLED response. */
  onDisabled: () => void;
  /** Optional text shown above the field, for example the session-ended message. */
  notice?: string;
}

const NETWORK_MESSAGE = "We couldn't reach the server. Please try again.";

async function readMessage(response: Response): Promise<{ ok: true; message: string | null } | { ok: false }> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string' && message.length > 0) return { ok: true, message };
    }
    return { ok: true, message: null };
  } catch {
    return { ok: false };
  }
}

export function AccessCodeForm({ onSuccess, onDisabled, notice }: AccessCodeFormProps) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const focusField = () => wrapperRef.current?.querySelector('input')?.focus();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || code.length === 0) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/pro/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: controller.signal,
      });
      const parsed = await readMessage(response);
      if (controller.signal.aborted) return;
      if (!parsed.ok) {
        setError(NETWORK_MESSAGE);
      } else if (response.status === 200) {
        setCode('');
        setPending(false);
        onSuccess();
        return;
      } else if (response.status === 503) {
        setPending(false);
        onDisabled();
        return;
      } else if (response.status === 401) {
        setError(ERROR_MESSAGES.INVALID_CODE);
        focusField();
      } else if (response.status === 429) {
        setError(parsed.message ?? ERROR_MESSAGES.TOO_MANY_ATTEMPTS);
      } else {
        setError(parsed.message ?? ERROR_MESSAGES.LOGIN_FAILED);
      }
    } catch {
      if (controller.signal.aborted) return;
      setError(NETWORK_MESSAGE);
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {notice ? <p role="status">{notice}</p> : null}
      <div ref={wrapperRef}>
        <TextField
          label="Access code"
          type="password"
          name="code"
          maxLength={200}
          autoComplete="off"
          value={code}
          onChange={setCode}
          error={error}
        />
      </div>
      <Button type="submit" disabled={pending || code.length === 0}>
        Enter
      </Button>
    </form>
  );
}
