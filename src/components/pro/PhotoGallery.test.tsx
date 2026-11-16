import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PhotoGallery } from './PhotoGallery';

afterEach(cleanup);

const URLS = ['https://example.com/a.jpg?sig=1', 'https://example.com/b.jpg?sig=2', 'https://example.com/c.jpg?sig=3'];

describe('PhotoGallery', () => {
  it('renders one link per URL that opens safely in a new tab', () => {
    render(<PhotoGallery photos={URLS} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    links.forEach((link, i) => {
      expect(link.getAttribute('href')).toBe(URLS[i]);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
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
