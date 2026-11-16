/**
 * Formats an ISO timestamp in the viewer's time zone, with a short zone name,
 * e.g. "Thu, Mar 5, 2026, 3:00 PM EST". Browser-only use.
 * Invalid input never throws; the raw string is returned instead.
 */
export function formatDateTime(iso: string, locale?: string | string[]): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return iso;
  }
}
