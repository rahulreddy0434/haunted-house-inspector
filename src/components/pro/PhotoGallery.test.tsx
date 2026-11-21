import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoGallery } from './PhotoGallery';
import { PHOTO_EXPIRED_MESSAGE } from './PhotoViewer';

afterEach(cleanup);

const URLS = ['https://example.com/a.jpg?sig=1', 'https://example.com/b.jpg?sig=2', 'https://example.com/c.jpg?sig=3'];

function thumb(n: number): HTMLElement {
  return screen.getByRole('button', { name: `Photo ${n} of 3 from the homeowner` });
}

async function open(n: number): Promise<HTMLElement> {
  await userEvent.click(thumb(n));
  return screen.getByRole('dialog');
}

describe('PhotoGallery thumbnails', () => {
  it('renders one thumbnail button per URL and no links that leave the page', () => {
    render(<PhotoGallery photos={URLS} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives each image a numbered alt text and lazy loading', () => {
    render(<PhotoGallery photos={URLS} />);
    const img = screen.getByAltText('Photo 2 of 3 from the homeowner');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('src')).toBe(URLS[1]);
  });

  it('renders nothing for no photos', () => {
    const { container } = render(<PhotoGallery photos={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('PhotoGallery viewer', () => {
  it('opens a modal dialog with the clicked photo, and focus moves to Close', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(2);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const big = within(dialog).getByAltText('Photo 2 of 3 from the homeowner');
    expect(big.getAttribute('src')).toBe(URLS[1]);
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
  });

  it('closes with the Close button and returns focus to the thumbnail that opened it', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(3);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(thumb(3));
  });

  it('closes with Esc and returns focus to the thumbnail', async () => {
    render(<PhotoGallery photos={URLS} />);
    await open(2);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(thumb(2));
  });

  it('closes when the user clicks outside the photo, but not on the photo itself', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    await userEvent.click(within(dialog).getByAltText('Photo 1 of 3 from the homeowner'));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    await userEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(thumb(1));
  });

  it('moves with Previous and Next, wraps around, and shows "Photo n of total"', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    expect(within(dialog).getByText('Photo 1 of 3')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText('Photo 2 of 3')).toBeTruthy();
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(URLS[1]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Previous' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Previous' }));
    expect(within(dialog).getByText('Photo 3 of 3')).toBeTruthy();
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(URLS[2]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText('Photo 1 of 3')).toBeTruthy();
  });

  it('moves with the left and right arrow keys', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('Photo 2 of 3')).toBeTruthy();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(within(dialog).getByText('Photo 3 of 3')).toBeTruthy();
  });

  it('returns focus to the thumbnail that opened it, even after moving to another photo', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(thumb(1));
  });

  it('keeps Tab inside the dialog', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    const close = within(dialog).getByRole('button', { name: 'Close' });
    const next = within(dialog).getByRole('button', { name: 'Next' });
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(next);
    await userEvent.tab();
    expect(document.activeElement).toBe(close);
  });

  it('shows no Previous, Next or counter for a single photo', async () => {
    render(<PhotoGallery photos={[URLS[0]]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Photo 1 of 1 from the homeowner' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Previous' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Next' })).toBeNull();
    expect(within(dialog).queryByText(/Photo 1 of 1$/)).toBeNull();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(URLS[0]);
  });

  it('shows the expired message when the photo fails to load, and keeps Close working', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    fireEvent.error(within(dialog).getByRole('img'));
    expect(within(dialog).getByText(PHOTO_EXPIRED_MESSAGE)).toBeTruthy();
    expect(PHOTO_EXPIRED_MESSAGE).toBe('This photo link has expired. Refresh the page to see it.');
    expect(within(dialog).queryByRole('img')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the next photo normally after one has expired', async () => {
    render(<PhotoGallery photos={URLS} />);
    const dialog = await open(1);
    fireEvent.error(within(dialog).getByRole('img'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).queryByText(PHOTO_EXPIRED_MESSAGE)).toBeNull();
    expect(within(dialog).getByRole('img').getAttribute('src')).toBe(URLS[1]);
  });

  it('restores page scrolling when the dialog closes', async () => {
    render(<PhotoGallery photos={URLS} />);
    await open(1);
    expect(document.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });
});
