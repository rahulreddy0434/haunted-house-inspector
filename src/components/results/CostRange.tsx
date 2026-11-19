import { Card } from "@/components/ui/Card";
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
    <Card as="section" aria-label="Rough cost">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 haunted:text-haunted-muted">
        Rough cost
      </h2>
      <p className="mt-1 text-2xl font-bold" data-testid="cost-amount">
        {amount}
      </p>
      <p
        className="mt-1 text-sm text-slate-700 haunted:text-haunted-muted"
        data-testid="cost-label"
      >
        rough range, not a quote
      </p>
    </Card>
  );
}
