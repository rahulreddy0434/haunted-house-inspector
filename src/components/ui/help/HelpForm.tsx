'use client';

import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { TextField } from '@/components/ui/TextField';
import { ERROR_TEXT, FIELD, MUTED, STATUS_BOX } from '@/components/ui/styles';
import { EmergencyBanner } from '@/components/results/EmergencyBanner';
import { useHelpForm } from '@/hooks/useHelpForm';
import {
  HELP_CONFIRMATION,
  HELP_FIELD_LABELS,
  HELP_HONEYPOT_LABEL,
  HELP_PRIVACY_LINE,
  HELP_SENDING_TEXT,
  HELP_SUBMIT_LABEL,
} from '@/lib/help/copy';
import { HELP_MESSAGE_MAX } from '@/lib/help/schema';
import type { HelpPage } from '@/lib/help/schema';
import type { ChatSide } from '@/types/chat';

export interface HelpFormProps {
  page: HelpPage;
  side: ChatSide;
  jobId?: string;
}

export function HelpForm({ page, side, jobId }: HelpFormProps) {
  const form = useHelpForm({ page, side, jobId });
  const { values, errors, phase } = form;
  const sending = phase === 'sending';

  return (
    <div className="space-y-3">
      {phase === 'emergency' ? <EmergencyBanner urgency="emergency" /> : null}
      <form ref={form.formRef} onSubmit={form.submit} noValidate className="space-y-3">
        <TextField
          label={HELP_FIELD_LABELS.name}
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(v) => form.setValue('name', v)}
          error={errors.name}
        />
        <TextField
          label={HELP_FIELD_LABELS.email}
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(v) => form.setValue('email', v)}
          error={errors.email}
        />
        <TextAreaField
          label={HELP_FIELD_LABELS.message}
          name="message"
          value={values.message}
          onChange={(v) => form.setValue('message', v)}
          error={errors.message}
          count={`${values.message.length} / ${HELP_MESSAGE_MAX}`}
        />
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden focus-visible:static">
          <input
            type="text"
            name="website"
            className={FIELD}
            tabIndex={-1}
            autoComplete="off"
            aria-label={HELP_HONEYPOT_LABEL}
            value={values.website}
            onChange={(e) => form.setValue('website', e.target.value)}
          />
        </div>
        <Button type="submit" disabled={sending}>
          {HELP_SUBMIT_LABEL}
        </Button>
        {sending ? (
          <p role="status" className={MUTED}>
            {HELP_SENDING_TEXT}
          </p>
        ) : null}
        {phase === 'error' && form.errorText ? (
          <p role="alert" className={`text-sm ${ERROR_TEXT}`}>
            {form.errorText}
          </p>
        ) : null}
      </form>
      {phase === 'sent' ? (
        <p role="status" className={`${STATUS_BOX} text-sm`}>
          {HELP_CONFIRMATION}
        </p>
      ) : null}
      <p className={MUTED}>{HELP_PRIVACY_LINE}</p>
    </div>
  );
}
