// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GuidedIntake } from '@/components/intake/GuidedIntake';
import { SAMPLE_FAILED_MESSAGE } from '@/lib/intake/copy';
import { SAMPLE_MANIFEST } from '@/lib/intake/sampleManifest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const SAMPLE_BUTTON = 'Try it with a sample photo';
const FIRST = SAMPLE_MANIFEST[0];
const SECOND = SAMPLE_MANIFEST[1];

let fetchMock: ReturnType<typeof vi.fn>;

function okResponse(): Response {
  return fakeResponse(200, new Blob(['sample-bytes'], { type: 'image/jpeg' }));
}

/** A minimal fetch Response whose blob() is a jsdom Blob (undici's Response mangles jsdom Blobs). */
function fakeResponse(status: number, blob: Blob = new Blob(['no'])): Response {
  return { ok: status >= 200 && status < 300, status, blob: async () => blob } as Response;
}

beforeEach(() => {
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:sample');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sampleButton = () => screen.queryByRole('button', { name: SAMPLE_BUTTON });

async function tapSample(file: string) {
  fireEvent.click(screen.getByRole('button', { name: SAMPLE_BUTTON }));
  await screen.findByText(file);
}

function removeSample(file: string) {
  fireEvent.click(screen.getByRole('button', { name: `Remove ${file}` }));
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }));

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const checkedBoxes = () =>
  (screen.queryAllByRole('checkbox') as HTMLInputElement[]).filter((c) => c.checked);

describe('Sample_Button', () => {
  it('is shown on Step 1 while no file is selected and hidden once a file is selected', async () => {
    render(<GuidedIntake />);
    expect(sampleButton()).not.toBeNull();

    await tapSample(FIRST.file);
    expect(sampleButton()).toBeNull();

    removeSample(FIRST.file);
    expect(sampleButton()).not.toBeNull();
  });

  it('is hidden when the Homeowner picks their own file', async () => {
    const { container } = render(<GuidedIntake />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const own = new File(['x'], 'mine.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [own] } });
    await screen.findByText('mine.jpg');
    expect(sampleButton()).toBeNull();
  });

  it('is not shown on Step 2 or Step 3', async () => {
    render(<GuidedIntake />);
    await tapSample(FIRST.file);
    next();
    await screen.findByRole('heading', { name: 'A few quick questions' });
    expect(sampleButton()).toBeNull();

    next();
    await screen.findByRole('heading', { name: /review|check|send/i });
    expect(sampleButton()).toBeNull();
  });

  it('adds exactly one file, fetched from /samples/, through the normal validation', async () => {
    render(<GuidedIntake />);
    await tapSample(FIRST.file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/samples/${FIRST.file}`);
    expect(screen.getByText('Selected: 1 photo')).toBeTruthy();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('does not add a file that fails validation (unsupported type)', async () => {
    fetchMock.mockImplementation(
      async () => fakeResponse(200, new Blob([], { type: 'text/plain' })),
    );
    render(<GuidedIntake />);
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_BUTTON }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(sampleButton()).not.toBeNull());
    expect(screen.queryByText('Selected: 1 photo')).toBeNull();
  });

  it('pre-selects the manifest answers on Step 2, and they can be changed or cleared', async () => {
    render(<GuidedIntake />);
    await tapSample(SAMPLE_MANIFEST[0].file);
    removeSample(SAMPLE_MANIFEST[0].file);
    await tapSample(SECOND.file);
    next();
    await screen.findByRole('heading', { name: 'A few quick questions' });

    expect(radio(SECOND.location).checked).toBe(true);
    expect(radio(SECOND.duration).checked).toBe(true);
    for (const extra of SECOND.extras) expect(checkbox(extra).checked).toBe(true);

    // Change a single-choice answer.
    fireEvent.click(radio('Kitchen'));
    expect(radio('Kitchen').checked).toBe(true);
    expect(radio(SECOND.location).checked).toBe(false);

    // Clear the duration and untick an extra.
    const clearButtons = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearButtons[clearButtons.length - 1]);
    expect(radio(SECOND.duration).checked).toBe(false);
    fireEvent.click(checkbox(SECOND.extras[0]));
    expect(checkbox(SECOND.extras[0]).checked).toBe(false);
  });

  it('pre-selects the first manifest entry answers (no extras) on first tap', async () => {
    render(<GuidedIntake />);
    await tapSample(FIRST.file);
    next();
    await screen.findByRole('heading', { name: 'A few quick questions' });
    expect(radio(FIRST.location).checked).toBe(true);
    expect(radio(FIRST.duration).checked).toBe(true);
    expect(checkedBoxes()).toHaveLength(0);
  });

  it('selects no Safety_Chip', async () => {
    render(<GuidedIntake />);
    expect(checkedBoxes()).toHaveLength(0);
    await tapSample(FIRST.file);
    expect(checkedBoxes()).toHaveLength(0);
    expect(screen.queryByText(/call 911/)).toBeNull();
  });

  it('leaves the Safety_Group and Free_Text unchanged', async () => {
    render(<GuidedIntake />);
    fireEvent.click(checkbox('I smell gas'));
    const safetyBefore = checkedBoxes().map((c) => c.value);
    expect(safetyBefore).toHaveLength(1);

    // Type Free_Text on Step 2, then come back to Step 1 and use the sample.
    await tapSample(FIRST.file);
    next();
    await screen.findByRole('heading', { name: 'A few quick questions' });
    fireEvent.change(screen.getByLabelText(/Exact place/), { target: { value: 'under the sink' } });
    back();
    await screen.findByRole('heading', { name: 'Safety check and photos' });
    removeSample(FIRST.file);
    await tapSample(SECOND.file);

    expect(checkedBoxes().map((c) => c.value)).toEqual(safetyBefore);

    next();
    await screen.findByRole('heading', { name: 'A few quick questions' });
    expect((screen.getByLabelText(/Exact place/) as HTMLInputElement).value).toBe('under the sink');
    expect(radio(SECOND.location).checked).toBe(true);
  });

  it('rotates in manifest order and wraps', async () => {
    render(<GuidedIntake />);
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const expected = SAMPLE_MANIFEST[i % SAMPLE_MANIFEST.length].file;
      await tapSample(expected);
      seen.push(expected);
      expect(fetchMock.mock.calls[i][0]).toBe(`/samples/${expected}`);
      removeSample(expected);
    }
    expect(seen).toEqual([FIRST.file, SECOND.file, FIRST.file]);
  });

  it('on a failed fetch shows the message and changes nothing', async () => {
    fetchMock.mockImplementation(async () => fakeResponse(404));
    render(<GuidedIntake />);
    fireEvent.click(checkbox('I smell gas'));
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_BUTTON }));

    expect(await screen.findByText(SAMPLE_FAILED_MESSAGE)).toBeTruthy();
    expect(SAMPLE_FAILED_MESSAGE).toBe(
      "We couldn't load the sample photo. Please add your own photo.",
    );
    expect(screen.queryByText('Selected: 1 photo')).toBeNull();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(sampleButton()).not.toBeNull();
    expect(checkedBoxes().map((c) => c.value)).toHaveLength(1);

    // Answers unchanged: no location chosen on Step 2 (Next is blocked without files, so
    // check the retry still starts from the first entry).
    fetchMock.mockImplementation(async () => okResponse());
    await tapSample(FIRST.file);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/samples/${FIRST.file}`);
  });

  it('on a network error shows the message and adds no file', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('network down');
    });
    render(<GuidedIntake />);
    fireEvent.click(screen.getByRole('button', { name: SAMPLE_BUTTON }));
    expect(await screen.findByText(SAMPLE_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });
});
