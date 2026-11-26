import { BODY, MUTED, SECONDARY_BUTTON } from '@/components/ui/styles';
import type { IntakeStep } from '@/types/intake';

export const STEP_LABELS: Record<IntakeStep, string> = {
  1: 'Safety check and photos',
  2: 'A few quick questions',
  3: 'Review and send',
};

const STEPS: readonly IntakeStep[] = [1, 2, 3];

export interface StepListProps {
  current: IntakeStep;
  /** Called for a finished step. The Intake_State is not touched by the list itself. */
  onGoTo: (step: 1 | 2) => void;
  disabled?: boolean;
}

/** The three Steps top to bottom. Finished steps are buttons, the current one says "Current step", later ones are plain text. */
export function StepList({ current, onGoTo, disabled = false }: StepListProps) {
  return (
    <ol className="space-y-2">
      {STEPS.map((n) => {
        const label = `Step ${n}: ${STEP_LABELS[n]}`;
        if (n < current) {
          return (
            <li key={n}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onGoTo(n as 1 | 2)}
                className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${SECONDARY_BUTTON}`}
              >
                {label}
              </button>
            </li>
          );
        }
        if (n === current) {
          return (
            <li key={n} aria-current="step" className={`px-3 py-2 font-semibold ${BODY}`}>
              {label}
              <span className={`block ${MUTED}`}>Current step</span>
            </li>
          );
        }
        return (
          <li key={n} className={`px-3 py-2 ${MUTED}`}>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
