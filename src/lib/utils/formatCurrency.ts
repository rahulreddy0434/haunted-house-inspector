export function formatCurrency(amount: number): string {
  // Rough ranges are shown as whole Canadian dollars; en-US renders the "CA$" prefix.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
