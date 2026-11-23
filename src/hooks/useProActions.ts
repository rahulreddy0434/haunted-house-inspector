'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JOB_STATUSES } from '@/types/job';
import type { JobStatus } from '@/types/job';

export type ProActionPath = 'accept' | 'decline';

export interface ProActionHandlers {
  /** Called with the new status after a successful action. */
  onDone: (status: JobStatus) => void;
  /** Called on 409 so the detail can reload and match the real status. */
  onConflict: () => void;
  /** Called on 401 so the access code form can be shown. */
  onUnauthorized: () => void;
}

export interface UseProActionsResult {
  pending: boolean;
  message: string | null;
  /** Which action the current message belongs to; null when there is no message. */
  failedPath: ProActionPath | null;
  send: (path: ProActionPath, body: Record<string, unknown>) => Promise<void>;
}

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

export function useProActions(
  id: string,
  { onDone, onConflict, onUnauthorized }: ProActionHandlers,
): UseProActionsResult {
  const [pending, setPending] = useState(false);
  const [message, setMessageState] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<ProActionPath | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (path: ProActionPath, body: Record<string, unknown>) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      setMessageState(null);
      setFailedPath(null);
      const fail = (text: string): void => {
        setMessageState(text);
        setFailedPath(path);
      };
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
          fail(GENERIC_ERROR);
          return;
        }
        const serverMessage = field(data, 'message');
        const text = typeof serverMessage === 'string' && serverMessage ? serverMessage : GENERIC_ERROR;
        if (response.status === 401) {
          onUnauthorized();
          return;
        }
        fail(text);
        if (response.status === 409) onConflict();
      } catch {
        if (controller.signal.aborted) return;
        fail(NETWORK_ERROR);
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

  return { pending, message, failedPath, send };
}
