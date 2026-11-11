/**
 * Component test for DropZone additive selection (task 15.14).
 * Validates: Requirements 1.9, 1.10, 1.11, 1.12, 1.13, 1.14
 *
 * Mocking approach:
 * - URL.createObjectURL / revokeObjectURL are replaced with vi.fn (unique 'blob:test-N').
 * - '@/lib/frameExtractor' is mocked so no real video decoding happens.
 * - The component reads a video's duration from an off-screen element created with
 *   document.createElement('video'). That one call is intercepted and returns a small fake
 *   element that fires onloadedmetadata (duration 10 s) as soon as `src` is assigned. All other
 *   createElement calls pass through, so React rendering is untouched.
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DropZone } from './DropZone';
import { extractFrames } from '@/lib/frameExtractor';
import type { AcceptedFiles, UploadValidationError } from '@/lib/validation/mediaValidation';

vi.mock('@/lib/frameExtractor', () => ({ extractFrames: vi.fn() }));

const extractFramesMock = vi.mocked(extractFrames);

let urlCounter = 0;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const realCreateElement = document.createElement.bind(document);

function photo(name: string, lastModified = 1000, size = 100): File {
  const file = new File([new Uint8Array(size)], name, { type: 'image/jpeg', lastModified });
  return file;
}

function video(name = 'clip.mp4'): File {
  return new File([new Uint8Array(10)], name, { type: 'video/mp4', lastModified: 5 });
}

function framesResult(seed: number) {
  return {
    frames: [1, 2, 3].map((i) => new Blob([new Uint8Array(seed * 10 + i)], { type: 'image/jpeg' })),
    timestamps: [1, 2, 3],
    durationSeconds: 10,
  };
}

interface Spies {
  onFilesAccepted: ReturnType<typeof vi.fn>;
  onValidationError: ReturnType<typeof vi.fn>;
  onSelectionCleared: ReturnType<typeof vi.fn>;
}

function makeSpies(): Spies {
  return { onFilesAccepted: vi.fn(), onValidationError: vi.fn(), onSelectionCleared: vi.fn() };
}

/** Controlled harness: holds `value` and forwards every callback to the spies. */
function Harness({ spies, initial = null }: { spies: Spies; initial?: AcceptedFiles | null }) {
  const [value, setValue] = useState<AcceptedFiles | null>(initial);
  return (
    <DropZone
      value={value}
      onFilesAccepted={(files) => {
        spies.onFilesAccepted(files);
        setValue(files);
      }}
      onValidationError={(errors: UploadValidationError[]) => spies.onValidationError(errors)}
      onSelectionCleared={() => {
        spies.onSelectionCleared();
        setValue(null);
      }}
    />
  );
}

function input(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function pick(...files: File[]) {
  fireEvent.change(input(), { target: { files } });
}

function names(call: unknown): string[] {
  return (call as AcceptedFiles).files.map((f) => f.name);
}

beforeEach(() => {
  urlCounter = 0;
  createObjectURL = vi.fn(() => `blob:test-${++urlCounter}`);
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

  extractFramesMock.mockReset();

  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
    if (tag.toLowerCase() !== 'video') return realCreateElement(tag, options);
    let src = '';
    const fake = {
      preload: '',
      muted: false,
      duration: 10,
      onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      get src() {
        return src;
      },
      set src(value: string) {
        src = value;
        queueMicrotask(() => fake.onloadedmetadata?.());
      },
    };
    return fake as unknown as HTMLVideoElement;
  }) as typeof document.createElement);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe('DropZone additive selection', () => {
  it('adds a second pick to the first and reports both files in order', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 1));
    pick(photo('b.jpg', 2));

    expect(spies.onFilesAccepted).toHaveBeenCalledTimes(2);
    expect(names(spies.onFilesAccepted.mock.calls[1][0])).toEqual(['a.jpg', 'b.jpg']);
    expect(screen.getByText('Selected: 2 photos')).toBeInTheDocument();
    expect(screen.getByText('a.jpg')).toBeInTheDocument();
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('shows name, thumbnail and a Remove button for each photo', () => {
    render(<Harness spies={makeSpies()} />);
    pick(photo('a.jpg', 1));
    pick(photo('b.jpg', 2));

    const imgA = screen.getByAltText('a.jpg') as HTMLImageElement;
    const imgB = screen.getByAltText('b.jpg') as HTMLImageElement;
    expect(imgA.getAttribute('src')).toBe('blob:test-1');
    expect(imgB.getAttribute('src')).toBe('blob:test-2');
    expect(screen.getByRole('button', { name: 'Remove a.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove b.jpg' })).toBeInTheDocument();
  });

  it('does not add a duplicate (same name, size and lastModified) twice', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 42, 100));
    pick(photo('a.jpg', 42, 100));

    expect(screen.getByText('Selected: 1 photo')).toBeInTheDocument();
    expect(screen.getAllByAltText('a.jpg')).toHaveLength(1);
    expect(spies.onFilesAccepted).toHaveBeenCalledTimes(1);
  });

  it('keeps the first 5 and reports TOO_MANY_IMAGES when a pick goes over 5', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('p1.jpg', 1), photo('p2.jpg', 2), photo('p3.jpg', 3));
    pick(photo('p4.jpg', 4), photo('p5.jpg', 5), photo('p6.jpg', 6));

    expect(names(spies.onFilesAccepted.mock.calls.at(-1)![0])).toEqual([
      'p1.jpg',
      'p2.jpg',
      'p3.jpg',
      'p4.jpg',
      'p5.jpg',
    ]);
    expect(spies.onValidationError).toHaveBeenCalledTimes(1);
    expect(spies.onValidationError.mock.calls[0][0][0].code).toBe('TOO_MANY_IMAGES');
    expect(screen.getByText(/The maximum is 5 photos/)).toBeInTheDocument();
    expect(screen.getByText('Selected: 5 photos')).toBeInTheDocument();
    expect(screen.queryByAltText('p6.jpg')).not.toBeInTheDocument();
    // At 5 photos the add control is replaced by the maximum text.
    expect(screen.getByText('You have added the maximum of 5 photos.')).toBeInTheDocument();
    expect(input()).toBeNull();
  });

  it('Remove reports the remaining photos and revokes only that photo URL', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 1), photo('b.jpg', 2), photo('c.jpg', 3));
    const urlB = screen.getByAltText('b.jpg').getAttribute('src')!;
    const urlA = screen.getByAltText('a.jpg').getAttribute('src')!;
    const urlC = screen.getByAltText('c.jpg').getAttribute('src')!;

    fireEvent.click(screen.getByRole('button', { name: 'Remove b.jpg' }));

    expect(names(spies.onFilesAccepted.mock.calls.at(-1)![0])).toEqual(['a.jpg', 'c.jpg']);
    expect(revokeObjectURL).toHaveBeenCalledWith(urlB);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(urlA);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(urlC);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText('b.jpg')).not.toBeInTheDocument();
  });

  it('removing the last photo calls onSelectionCleared and revokes its URL', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 1));
    const url = screen.getByAltText('a.jpg').getAttribute('src')!;
    const acceptedCalls = spies.onFilesAccepted.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }));

    expect(spies.onSelectionCleared).toHaveBeenCalledTimes(1);
    expect(spies.onFilesAccepted).toHaveBeenCalledTimes(acceptedCalls);
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(screen.queryByText(/^Selected:/)).not.toBeInTheDocument();
  });

  it('revokes all remaining object URLs on unmount', () => {
    const { unmount } = render(<Harness spies={makeSpies()} />);
    pick(photo('a.jpg', 1), photo('b.jpg', 2));
    const urls = [
      screen.getByAltText('a.jpg').getAttribute('src')!,
      screen.getByAltText('b.jpg').getAttribute('src')!,
    ];
    expect(revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    for (const url of urls) expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(revokeObjectURL).toHaveBeenCalledTimes(urls.length);
  });

  it('labels the add control by state: empty, 1-4 photos, none at 5', () => {
    render(<Harness spies={makeSpies()} />);
    expect(screen.getByText('Choose photos or a video')).toBeInTheDocument();

    pick(photo('p1.jpg', 1));
    expect(screen.getByText('Add more photos')).toBeInTheDocument();
    expect(screen.queryByText('Choose photos or a video')).not.toBeInTheDocument();

    pick(photo('p2.jpg', 2), photo('p3.jpg', 3), photo('p4.jpg', 4));
    expect(screen.getByText('Add more photos')).toBeInTheDocument();

    pick(photo('p5.jpg', 5));
    expect(screen.queryByText('Add more photos')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose photos or a video')).not.toBeInTheDocument();
  });

  it('Clear selection calls onSelectionCleared and URLs are revoked once the parent clears value', () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 1), photo('b.jpg', 2));
    const urls = [
      screen.getByAltText('a.jpg').getAttribute('src')!,
      screen.getByAltText('b.jpg').getAttribute('src')!,
    ];

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(spies.onSelectionCleared).toHaveBeenCalledTimes(1);
    for (const url of urls) expect(revokeObjectURL).toHaveBeenCalledWith(url);
    expect(screen.getByText('Choose photos or a video')).toBeInTheDocument();
  });

  it('rejects a video added while photos are selected and leaves the selection unchanged', async () => {
    const spies = makeSpies();
    render(<Harness spies={spies} />);
    pick(photo('a.jpg', 1));
    const acceptedCalls = spies.onFilesAccepted.mock.calls.length;

    pick(video());

    expect(await screen.findByText('Please choose either photos or one video, not both.')).toBeInTheDocument();
    expect(spies.onValidationError.mock.calls.at(-1)![0][0].code).toBe('MIXED_MEDIA');
    expect(extractFramesMock).not.toHaveBeenCalled();
    expect(spies.onFilesAccepted).toHaveBeenCalledTimes(acceptedCalls);
    expect(screen.getByText('Selected: 1 photo')).toBeInTheDocument();
    expect(screen.getByAltText('a.jpg')).toBeInTheDocument();
  });

  it('rejects photos added while a video is selected and leaves the selection unchanged', async () => {
    const spies = makeSpies();
    extractFramesMock.mockResolvedValue(framesResult(1));
    render(<Harness spies={spies} />);
    pick(video());
    await screen.findByText('Video selected');
    const acceptedCalls = spies.onFilesAccepted.mock.calls.length;

    // The add control now reads "Choose a different video" but still accepts any pick.
    pick(photo('a.jpg', 1));

    expect(await screen.findByText('Please choose either photos or one video, not both.')).toBeInTheDocument();
    expect(spies.onValidationError.mock.calls.at(-1)![0][0].code).toBe('MIXED_MEDIA');
    expect(spies.onFilesAccepted).toHaveBeenCalledTimes(acceptedCalls);
    expect(screen.getByText('Video selected')).toBeInTheDocument();
    expect(screen.getByText('3 frames prepared')).toBeInTheDocument();
    expect(screen.queryByAltText('a.jpg')).not.toBeInTheDocument();
  });

  it('a new video replaces the selected video', async () => {
    const spies = makeSpies();
    extractFramesMock
      .mockResolvedValueOnce(framesResult(1))
      .mockResolvedValueOnce(framesResult(2));
    render(<Harness spies={spies} />);

    pick(video('first.mp4'));
    await waitFor(() => expect(spies.onFilesAccepted).toHaveBeenCalledTimes(1));
    const firstSizes = (spies.onFilesAccepted.mock.calls[0][0] as AcceptedFiles).files.map((f) => f.size);

    await act(async () => {
      pick(video('second.mp4'));
    });
    await waitFor(() => expect(spies.onFilesAccepted).toHaveBeenCalledTimes(2));

    expect(extractFramesMock).toHaveBeenCalledTimes(2);
    const second = spies.onFilesAccepted.mock.calls[1][0] as AcceptedFiles;
    expect(second.kind).toBe('frames');
    expect(second.files).toHaveLength(3);
    expect(second.files.map((f) => f.size)).not.toEqual(firstSizes);
    expect(spies.onValidationError).not.toHaveBeenCalled();
    const status = screen.getByText('Video selected').closest('div')!;
    expect(within(status).getByText('3 frames prepared')).toBeInTheDocument();
  });
});
