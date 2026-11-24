import type { IntakeStep } from '@/types/intake';

export interface StepProgressProps {
  step: IntakeStep;
}

/** "Step N of 3" and a bar. Width only, no transition, so it never animates. */
export function StepProgress({ step }: StepProgressProps) {
  const text = `Step ${step} of 3`;
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 haunted:text-haunted-muted">{text}</p>
      <div
        role="progressbar"
        aria-label="Intake progress"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={step}
        aria-valuetext={text}
        className="mt-1 h-2 w-full rounded-full bg-slate-300 haunted:bg-haunted-field"
      >
        <div
          className="h-full rounded-full bg-blue-700 haunted:bg-haunted-accent"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>
    </div>
  );
}
