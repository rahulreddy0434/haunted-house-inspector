'use client';

import { LiveSummary } from '@/components/intake/LiveSummary';
import { StepList } from '@/components/intake/StepList';
import { CARD_14, HEADING } from '@/components/ui/styles';
import { useStickyPanel } from '@/hooks/useStickyPanel';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { IntakeChoices, IntakeStep } from '@/types/intake';

export interface InspectionPanelProps {
  step: IntakeStep;
  choices: IntakeChoices;
  files: AcceptedFiles | null;
  onGoTo: (step: 1 | 2) => void;
  busy?: boolean;
}

/**
 * "Your inspection" card for the desktop right column. Hidden below 1024 px by CSS only.
 * Sticky (lg:sticky lg:top-4) only while the whole panel plus the top offset fits in the window (useStickyPanel);
 * otherwise it scrolls with the page and is shown whole (no overflow or max-height, so no inner scroll box).
 */
export function InspectionPanel({ step, choices, files, onGoTo, busy = false }: InspectionPanelProps) {
  const { ref, className } = useStickyPanel<HTMLElement>();
  return (
    <aside
      ref={ref}
      data-section="inspection-panel"
      aria-labelledby="inspection-panel-title"
      className={['hidden lg:block', className].filter(Boolean).join(' ')}
    >
      <div className={`${CARD_14} space-y-4`}>
        <h2 id="inspection-panel-title" className="text-lg font-semibold">
          Your inspection
        </h2>
        <StepList current={step} onGoTo={onGoTo} disabled={busy} />
        <div className="border-t border-normal-card-border pt-4 haunted:border-haunted-border">
          <h3 className={`mb-3 ${HEADING}`}>So far</h3>
          <LiveSummary choices={choices} files={files} />
        </div>
      </div>
    </aside>
  );
}
