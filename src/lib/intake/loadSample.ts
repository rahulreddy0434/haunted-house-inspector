import type { SampleEntry } from '@/lib/intake/sampleManifest';

/** Fetches a bundled sample photo and returns it as a File. Throws on any failure. */
export async function loadSample(
  entry: SampleEntry,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): Promise<File> {
  const response = await fetchImpl(`/samples/${entry.file}`);
  if (!response.ok) {
    throw new Error(`Sample request failed with status ${response.status}`);
  }
  const blob = await response.blob();
  return new File([blob], entry.file, { type: blob.type || 'image/jpeg' });
}
