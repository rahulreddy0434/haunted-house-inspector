'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AcceptForm } from '@/components/pro/AcceptForm';
import { AskInfoForm } from '@/components/pro/AskInfoForm';
import { DeclineForm } from '@/components/pro/DeclineForm';
import { CARD, ERROR_TEXT, HEADING } from '@/components/ui/styles';
import { JOB_STATUSES } from '@/types/job';
import type { JobStatus } from '@/types/job';

export interface ActionPanelProps {
  id: string;
  status: JobStatus;
  /** Called with the new status after a successful action. */
  onDone: (status: JobStatus) => void;
  /** Called on 409 so the detail can reload and match the real status. */
  onConflict: () => void;
  /** Called on 401 so the access code form can be shown. */
  onUnauthorized: () => void;
}

type ActionPath = 'accept' | 'decline' | 'ask-info';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const NETWORK_ERROR = "We couldn't reach the server. Please try again.";

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

export function ActionPanel({ id, status, onDone, onConflict, onUnauthorized }: ActionPanelProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (path: ActionPath, body: Record<string, unknown>) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setMessage(null);
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const response = await fetch(`/api/pro/jobs/${encodeURIComponent(id)}/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await readJson(response);
        if (controller.signal.aborted) return;
        if (response.ok) {
          const next = field(data, 'status');
          if (isJobStatus(next)) {
            onDone(next);
            return;
          }
          setMessage(GENERIC_ERROR);
          return;
        }
        const serverMessage = field(data, 'message');
        const text = typeof serverMessage === 'string' && serverMessage ? serverMessage : GENERIC_ERROR;
        if (response.status === 401) {
          onUnauthorized();
          return;
        }
        setMessage(text);
        if (response.status === 409) onConflict();
      } catch {
        if (controller.signal.aborted) return;
        setMessage(NETWORK_ERROR);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        if (!controller.signal.aborted) {
          pendingRef.current = false;
          setPending(false);
        }
      }
    },
    [id, onDone, onConflict, onUnauthorized],
  );

  if (status !== 'new' && status !== 'info_requested') return null;

  return (
    <section aria-labelledby="pro-actions-heading" className={`${CARD} space-y-6`}>
      <h2 id="pro-actions-heading" className={HEADING}>
        Your response
      </h2>
      <AcceptForm pending={pending} onSubmit={(slots) => void send('accept', { slots })} />
      <DeclineForm
        pending={pending}
        onSubmit={(reason) => void send('decline', reason.trim() ? { reason } : {})}
      />
      {status === 'new' ? (
        <AskInfoForm pending={pending} onSubmit={(question) => void send('ask-info', { question })} />
      ) : null}
      {message ? (
        <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
