import type { UrgencyLevel } from "@/types/inspection";
import { formatCurrency } from "@/lib/utils/formatCurrency";

export interface CostRangeProps {
  costRangeLow: number;
  costRangeHigh: number;
  urgency: UrgencyLevel;
}

/**
 * Rough cost estimate in CAD. Hidden entirely for emergencies (no cost, no label).
 * The "rough range, not a quote" label is always rendered beneath the amount.
 */
export function CostRange({ costRangeLow, costRangeHigh, urgency }: CostRangeProps) {
  if (urgency === "emergency") {
    return null;
  }

  const amount =
    costRangeLow === costRangeHigh
      ? formatCurrency(costRangeLow)
      : `${formatCurrency(costRangeLow)} – ${formatCurrency(costRangeHigh)}`;

  return (
    <section
      aria-label="Rough cost"
      className="rounded-lg border border-slate-300 bg-white p-4 text-slate-900 haunted:border-slate-600 haunted:bg-slate-900 haunted:text-slate-100"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 haunted:text-slate-300">
        Rough cost
      </h2>
      <p className="mt-1 text-2xl font-bold" data-testid="cost-amount">
        {amount}
      </p>
      <p
        className="mt-1 text-sm text-slate-700 haunted:text-slate-300"
        data-testid="cost-label"
      >
        rough range, not a quote
      </p>
    </section>
  );
}
