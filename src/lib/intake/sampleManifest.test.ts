import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSample } from '@/lib/intake/loadSample';
import { DURATION_OPTIONS, EXTRAS_OPTIONS, LOCATION_OPTIONS } from '@/lib/intake/options';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import { SAMPLE_MANIFEST } from '@/lib/intake/sampleManifest';
import { validateSelection } from '@/lib/validation/mediaValidation';

const SAMPLES_DIR = path.join(process.cwd(), 'public', 'samples');

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** Detects the real type from the file's first bytes. */
function sniffType(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

describe('Sample_Manifest', () => {
  it('has exactly two entries', () => {
    expect(SAMPLE_MANIFEST).toHaveLength(2);
  });

  it('lists only files that exist, and every file in public/samples has an entry', () => {
    const onDisk = readdirSync(SAMPLES_DIR).sort();
    const listed = SAMPLE_MANIFEST.map((e) => e.file as string).sort();
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toEqual(onDisk);
  });

  it.each(SAMPLE_MANIFEST.map((e) => [e.file, e] as const))(
    '%s passes the app media validation by extension, bytes and size',
    (file) => {
      const full = path.join(SAMPLES_DIR, file);
      const bytes = readFileSync(full);
      const size = statSync(full).size;
      const type = MIME_BY_EXTENSION[path.extname(file).toLowerCase()];

      expect(type).toBeDefined();
      expect(sniffType(bytes)).toBe(type);
      expect(size).toBeGreaterThan(0);
      expect(validateSelection([{ name: file, type, size }])).toEqual([]);
    },
  );

  it('uses chosen labels that are members of the option lists', () => {
    for (const entry of SAMPLE_MANIFEST) {
      expect(LOCATION_OPTIONS).toContain(entry.location);
      expect(DURATION_OPTIONS).toContain(entry.duration);
      for (const extra of entry.extras) expect(EXTRAS_OPTIONS).toContain(extra);
    }
  });

  it('does not pre-select any Safety_Chip', () => {
    for (const entry of SAMPLE_MANIFEST) {
      expect(Object.keys(entry)).not.toContain('safety');
      const chosen = [entry.location, entry.duration, ...entry.extras] as string[];
      for (const chip of SAFETY_CHIPS) {
        expect(chosen).not.toContain(chip.id);
        expect(chosen).not.toContain(chip.label);
      }
    }
  });
});

describe('loadSample', () => {
  it('rejects when the fetch response is not ok', async () => {
    const fakeFetch = (async () =>
      new Response('missing', { status: 404 })) as unknown as typeof fetch;
    await expect(loadSample(SAMPLE_MANIFEST[0], fakeFetch)).rejects.toThrow();
  });

  it('rejects when the fetch itself fails', async () => {
    const fakeFetch = (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(loadSample(SAMPLE_MANIFEST[1], fakeFetch)).rejects.toThrow('network down');
  });
});
