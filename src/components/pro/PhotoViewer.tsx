'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BODY, CARD, SECONDARY_BUTTON } from '@/components/ui/styles';

export const PHOTO_EXPIRED_MESSAGE = 'This photo link has expired. Refresh the page to see it.';

export interface PhotoViewerProps {
  /** Pre-signed GET URLs. */
  photos: string[];
  /** Index of the photo to show. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

const OVERLAY = 'fixed inset-0 z-50 flex flex-col gap-2 bg-slate-900/90 p-2 haunted:bg-haunted-bg/90';
const BAR = `${CARD} flex items-center justify-between gap-2 !p-2`;
const BUTTON = `${SECONDARY_BUTTON} min-h-11 rounded-md px-4 py-2 text-base font-semibold`;

/**
 * Full-screen photo dialog. Uses role="dialog" with aria-modal rather than the native <dialog>
 * element, because jsdom (the test environment) has no showModal(). Focus moves to Close when it
 * opens and is kept inside the dialog; the caller returns focus to the thumbnail on close.
 */
export function PhotoViewer({ photos, index, onIndexChange, onClose }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());

  const total = photos.length;
  const many = total > 1;
  const go = (step: number): void => onIndexChange((index + step + total) % total);

  // Keep the latest handlers for the document listener without re-subscribing on every render.
  const latest = useRef({ index, total, many, onIndexChange, onClose });
  latest.current = { index, total, many, onIndexChange, onClose };

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent): void => {
      const cur = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        cur.onClose();
      } else if (cur.many && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const step = e.key === 'ArrowLeft' ? -1 : 1;
        cur.onIndexChange((cur.index + step + cur.total) % cur.total);
      } else if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!active || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const closeOnOutsideClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === dialogRef.current || e.target === areaRef.current) onClose();
  };

  const url = photos[index];
  const expired = failed.has(index);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className={OVERLAY}
      onClick={closeOnOutsideClick}
    >
      <div className={BAR}>
        {many ? (
          <p aria-live="polite" className={`${BODY} text-base font-semibold`}>
            {`Photo ${index + 1} of ${total}`}
          </p>
        ) : (
          <span />
        )}
        <button ref={closeRef} type="button" onClick={onClose} className={BUTTON}>
          Close
        </button>
      </div>

      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center" onClick={closeOnOutsideClick}>
        {expired ? (
          <p role="alert" className={`${CARD} ${BODY} max-w-md text-center`}>
            {PHOTO_EXPIRED_MESSAGE}
          </p>
        ) : (
          // Plain <img> on purpose: the URLs expire after 15 minutes and must not go through the image optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`Photo ${index + 1} of ${total} from the homeowner`}
            onError={() => setFailed((prev) => new Set(prev).add(index))}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        )}
      </div>

      {many ? (
        <div className={BAR}>
          <button type="button" onClick={() => go(-1)} className={BUTTON}>
            Previous
          </button>
          <button type="button" onClick={() => go(1)} className={BUTTON}>
            Next
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
