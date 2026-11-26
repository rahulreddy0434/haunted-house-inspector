'use client';

import { Thumbnails } from '@/components/intake/ReviewList';
import { HEADING } from '@/components/ui/styles';
import {
  NO_DURATION_TEXT,
  NO_EXTRAS_TEXT,
  NO_PHOTOS_TEXT,
  NO_SAFETY_TEXT,
  reviewText,
} from '@/lib/intake/reviewText';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { IntakeChoices } from '@/types/intake';

export const NO_WHERE_TEXT = 'Not chosen yet';

export interface LiveSummaryProps {
  choices: IntakeChoices;
  files: AcceptedFiles | null;
}

function Line({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={HEADING}>{title}</dt>
      <dd className={`mt-1 break-words text-sm text-normal-text haunted:text-haunted-text`}>{children}</dd>
    </div>
  );
}

function TextList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="list-disc pl-5">
      {items.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ul>
  );
}

/** The current Intake_State as text and thumbnails. Uses the same text as the Step 3 review. */
export function LiveSummary({ choices, files }: LiveSummaryProps) {
  const text = reviewText(choices);
  return (
    <dl className="space-y-3">
      <Line title="Photos">
        {files && files.files.length > 0 ? <Thumbnails files={files.files} compact /> : NO_PHOTOS_TEXT}
      </Line>
      <Line title="Safety check">
        <TextList items={text.safety} empty={NO_SAFETY_TEXT} />
      </Line>
      <Line title="Where">{text.where || NO_WHERE_TEXT}</Line>
      <Line title="How long">{text.duration || NO_DURATION_TEXT}</Line>
      <Line title="Anything else">
        <TextList items={text.extras} empty={NO_EXTRAS_TEXT} />
      </Line>
    </dl>
  );
}
