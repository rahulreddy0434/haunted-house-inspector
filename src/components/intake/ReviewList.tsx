'use client';

import { useEffect, useState } from 'react';
import { BODY, HEADING, MUTED, SECONDARY_BUTTON } from '@/components/ui/styles';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { cleanFreeText, somethingElseLimit, truncateUtf16 } from '@/lib/intake/answerMapper';
import { EXTRAS_OPTIONS, SOMETHING_ELSE } from '@/lib/intake/options';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { IntakeChoices } from '@/types/intake';
import type { ContextAnswers } from '@/types/inspection';

export interface ReviewListProps {
  choices: IntakeChoices;
  /** The exact strings that will be sent. */
  answers: ContextAnswers;
  files: AcceptedFiles | null;
  /** Safety and photos go to Step 1; everything else goes to Step 2. */
  onChange: (step: 1 | 2) => void;
}

const CHANGE_BUTTON = `min-h-11 min-w-11 rounded-lg px-4 py-2 text-sm font-medium ${SECONDARY_BUTTON}`;

function Thumbnails({ files }: { files: File[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);
    return () => {
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="max-w-full">
          {urls[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urls[i]}
              alt={`Photo ${i + 1}: ${f.name}`}
              className="h-20 w-20 rounded-lg object-cover"
            />
          )}
          <span className={`block max-w-20 break-words ${MUTED}`}>{f.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Row({
  title,
  onChange,
  changeLabel,
  children,
}: {
  title: string;
  onChange: () => void;
  changeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <dt className={HEADING}>{title}</dt>
        <dd className={`mt-1 break-words ${BODY}`}>{children}</dd>
      </div>
      <button type="button" onClick={onChange} aria-label={changeLabel} className={CHANGE_BUTTON}>
        Change
      </button>
    </div>
  );
}

export function ReviewList({ choices, answers, files, onChange }: ReviewListProps) {
  const safety = SAFETY_CHIPS.filter((c) => choices.safety.includes(c.id)).map((c) => c.label);

  const extras: string[] = EXTRAS_OPTIONS.filter(
    (o) => o !== SOMETHING_ELSE && choices.extras.includes(o),
  );
  if (choices.extras.includes(SOMETHING_ELSE)) {
    const free = truncateUtf16(
      cleanFreeText(choices.somethingElseText),
      somethingElseLimit(choices),
    );
    if (free) extras.push(free);
  }

  return (
    <dl className="space-y-4">
      <Row title="Safety check" onChange={() => onChange(1)} changeLabel="Change safety check">
        {safety.length > 0 ? (
          <ul className="list-disc pl-5">
            {safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          'None selected'
        )}
      </Row>
      <Row title="Photos" onChange={() => onChange(1)} changeLabel="Change photos">
        {files && files.files.length > 0 ? <Thumbnails files={files.files} /> : 'No photos'}
      </Row>
      <Row title="Where" onChange={() => onChange(2)} changeLabel="Change where">
        {answers.location}
      </Row>
      <Row title="How long" onChange={() => onChange(2)} changeLabel="Change how long">
        {answers.duration || 'Not given'}
      </Row>
      <Row title="Anything else" onChange={() => onChange(2)} changeLabel="Change anything else">
        {extras.length > 0 ? (
          <ul className="list-disc pl-5">
            {extras.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          'Nothing added'
        )}
      </Row>
    </dl>
  );
}
