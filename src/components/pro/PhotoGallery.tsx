import { CARD, HEADING } from '@/components/ui/styles';

export interface PhotoGalleryProps {
  /** Pre-signed GET URLs. */
  photos: string[];
}

/** Plain <img> on purpose: the URLs expire after 15 minutes and must not go through the image optimiser. */
export function PhotoGallery({ photos }: PhotoGalleryProps) {
  if (photos.length === 0) return null;

  return (
    <section aria-label="Photos" className={CARD}>
      <h2 className={HEADING}>Photos</h2>
      <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((url, i) => (
          <li key={i}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1} of ${photos.length} from the homeowner`} loading="lazy" className="h-auto w-full rounded-md" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
