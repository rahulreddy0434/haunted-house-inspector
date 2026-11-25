'use client';

import Link from 'next/link';
import { useProChrome } from '@/components/pro/ProChromeContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HeaderSilhouette } from '@/components/ui/haunted/HeaderSilhouette';
import { SECONDARY_BUTTON } from '@/components/ui/styles';

export const MAIN_CONTENT_ID = 'main-content';

export interface SiteHeaderProps {
  /** Shows the "PRO" tag and keeps the header content in a centred 1120 px column. */
  tag?: 'PRO';
  /** When set, shows a "Log out" button that calls it. */
  onLogout?: () => void;
}

const SKIP_LINK =
  'sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-normal-card focus:px-4 focus:py-2 focus:text-normal-text focus:shadow haunted:focus:bg-haunted-surface haunted:focus:text-haunted-text focus-visible:ring-2 focus-visible:ring-normal-accent haunted:focus-visible:ring-haunted-accent';

export function SiteHeader(props: SiteHeaderProps) {
  const { chrome } = useProChrome();
  const tag = props.tag ?? chrome?.tag;
  const onLogout = props.onLogout ?? chrome?.onLogout;
  const inner = tag
    ? 'mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-6 py-3'
    : 'flex flex-wrap items-center justify-between gap-3 px-5 py-3.5';

  return (
    <header className="border-b border-normal-card-border bg-normal-card haunted:border-haunted-border haunted:bg-transparent">
      <a href={`#${MAIN_CONTENT_ID}`} className={SKIP_LINK}>
        Skip to main content
      </a>
      <div className={inner}>
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="text-[17px] font-bold tracking-tight text-normal-accent haunted:text-haunted-accent"
          >
            Haunted House Inspector
          </Link>
          {tag ? (
            <span className="rounded-md bg-normal-text px-2 py-[3px] text-xs font-bold tracking-wide text-normal-card haunted:bg-haunted-accent haunted:text-haunted-on-accent">
              {tag}
            </span>
          ) : null}
        </div>
        <HeaderSilhouette />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${SECONDARY_BUTTON}`}
            >
              Log out
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
