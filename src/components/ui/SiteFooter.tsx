import { ACCENT_TEXT, MUTED_TEXT } from '@/components/ui/styles';

export const WEEKLY_RESET_URL = 'https://www.weeklyresetwr.com';

export function SiteFooter() {
  return (
    <footer
      className={`border-t border-normal-card-border bg-normal-card px-5 pb-6 pt-4 text-center text-xs haunted:border-haunted-border haunted:bg-transparent ${MUTED_TEXT}`}
    >
      <p>Estimates only. Not a professional inspection.</p>
      <p className="mt-1">
        <a
          href={WEEKLY_RESET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-normal-accent focus-visible:ring-offset-2 haunted:focus-visible:ring-haunted-accent ${ACCENT_TEXT}`}
        >
          A Weekly Reset product
        </a>
      </p>
    </footer>
  );
}
