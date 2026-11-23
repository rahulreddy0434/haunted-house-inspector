'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { HELP_FIELD_MESSAGES, helpBodySchema } from '@/lib/help/schema';
import type { HelpPage } from '@/lib/help/schema';
import type { ChatSide } from '@/types/chat';

export type HelpPhase = 'idle' | 'sending' | 'sent' | 'emergency' | 'error';
export type HelpFieldName = 'name' | 'email' | 'message';

export interface HelpValues {
  name: string;
  email: string;
  message: string;
  /** Honeypot. Real visitors never see or fill it. */
  website: string;
}

export type HelpFieldErrors = Partial<Record<HelpFieldName, string>>;

export interface UseHelpFormOptions {
  page: HelpPage;
  side: ChatSide;
  jobId?: string;
}

export interface UseHelpFormReturn {
  values: HelpValues;
  errors: HelpFieldErrors;
  phase: HelpPhase;
  /** Visitor-facing text for phase "error" (and the limit message). */
  errorText: string | null;
  /** Fixed safety text for phase "emergency". */
  emergencyMessage: string | null;
  /** The trimmed email the visitor submitted; kept after the form clears (phase "sent"). */
  sentEmail: string;
  /** Attach to the <form>; used to focus the first invalid field by name. */
  formRef: RefObject<HTMLFormElement | null>;
  setValue: (field: keyof HelpValues, value: string) => void;
  submit: (event?: FormEvent) => Promise<void>;
}

const EMPTY: HelpValues = { name: '', email: '', message: '', website: '' };
const FIELD_ORDER: readonly HelpFieldName[] = ['name', 'email', 'message'];
const FALLBACK_ERROR = 'We could not send your message. Please try again in a moment.';

function isFieldName(value: string): value is HelpFieldName {
  return value === 'name' || value === 'email' || value === 'message';
}

function readBody(raw: unknown): { status?: string; message?: string; fields?: HelpFieldErrors } {
  if (typeof raw !== 'object' || raw === null) return {};
  const record = raw as Record<string, unknown>;
  const out: { status?: string; message?: string; fields?: HelpFieldErrors } = {};
  if (typeof record.status === 'string') out.status = record.status;
  if (typeof record.message === 'string') out.message = record.message;
  if (typeof record.fields === 'object' && record.fields !== null) {
    const fields: HelpFieldErrors = {};
    for (const [key, value] of Object.entries(record.fields)) {
      if (isFieldName(key) && typeof value === 'string') fields[key] = value;
    }
    out.fields = fields;
  }
  return out;
}

export function useHelpForm({ page, side, jobId }: UseHelpFormOptions): UseHelpFormReturn {
  const [values, setValues] = useState<HelpValues>(EMPTY);
  const [errors, setErrors] = useState<HelpFieldErrors>({});
  const [phase, setPhase] = useState<HelpPhase>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setValue = useCallback((field: keyof HelpValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (field !== 'website') setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const focusFirstInvalid = useCallback((found: HelpFieldErrors) => {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (!first) return;
    const el = formRef.current?.elements.namedItem(first);
    if (el instanceof HTMLElement) el.focus();
  }, []);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      if (busy.current) return;

      const parsed = helpBodySchema.safeParse({
        name: values.name,
        email: values.email,
        message: values.message,
        page,
        side,
        ...(jobId ? { jobId } : {}),
      });
      if (!parsed.success) {
        const found: HelpFieldErrors = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          if (isFieldName(key)) found[key] = HELP_FIELD_MESSAGES[key];
        }
        if (Object.keys(found).length > 0) {
          setErrors(found);
          setErrorText(null);
          setPhase('idle');
          focusFirstInvalid(found);
          return;
        }
      }

      busy.current = true;
      setErrors({});
      setErrorText(null);
      setPhase('sending');
      try {
        const response = await fetch('/api/help', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            email: values.email,
            message: values.message,
            website: values.website,
            page,
            side,
            ...(jobId ? { jobId } : {}),
          }),
        });
        let raw: unknown = null;
        try {
          raw = await response.json();
        } catch {
          raw = null;
        }
        if (!alive.current) return;
        const body = readBody(raw);

        if (response.ok && body.status === 'emergency' && body.message) {
          setEmergencyMessage(body.message);
          setValues(EMPTY);
          setPhase('emergency');
          return;
        }
        if (response.ok && (body.status === 'sent' || body.status === 'ok')) {
          setSentEmail(values.email.trim());
          setValues(EMPTY);
          setPhase('sent');
          return;
        }
        if (response.status === 400 && body.fields && Object.keys(body.fields).length > 0) {
          setErrors(body.fields);
          setPhase('idle');
          focusFirstInvalid(body.fields);
          return;
        }
        // 429, 500 and anything else: keep the values.
        setErrorText(body.message ?? FALLBACK_ERROR);
        setPhase('error');
      } catch {
        if (!alive.current) return;
        setErrorText(FALLBACK_ERROR);
        setPhase('error');
      } finally {
        busy.current = false;
      }
    },
    [values, page, side, jobId, focusFirstInvalid],
  );

  return { values, errors, phase, errorText, emergencyMessage, sentEmail, formRef, setValue, submit };
}
