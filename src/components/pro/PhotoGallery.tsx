'use client';

import { useEffect, useRef, useState } from 'react';
import { PhotoViewer } from '@/components/pro/PhotoViewer';
import { Card } from '@/components/ui/Card';
import { HEADING } from '@/components/ui/styles';

export interface PhotoGalleryProps {
  /** Pre-signed GET URLs. */
  photos: string[];
}

/** Plain <img> on purpose: the URLs expire after 15 minutes and must not go through the image optimiser. */
export function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** The thumbnail that opened the viewer; focus goes back to it on close. */
  const openerRef = useRef(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (openIndex !== null) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      thumbRefs.current[openerRef.current]?.focus();
    }
  }, [openIndex]);

  if (photos.length === 0) return null;

  return (
    <Card as="section" aria-label="Photos">
      <h2 className={HEADING}>Photos</h2>
      <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url, i) => (
          <li key={i}>
            <button
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                openerRef.current = i;
                setOpenIndex(i);
              }}
              className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1} of ${photos.length} from the homeowner`} loading="lazy" className="h-auto w-full rounded-md" />
            </button>
          </li>
        ))}
      </ul>
      {openIndex !== null ? (
        <PhotoViewer photos={photos} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </Card>
  );
}
