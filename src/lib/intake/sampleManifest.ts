import type { DurationOption, ExtrasOption, LocationOption } from '@/types/intake';

export interface SampleEntry {
  file: 'wall-hole.jpeg' | 'bathroom-tap.jpeg';
  description: string;
  location: LocationOption;
  duration: DurationOption;
  extras: readonly ExtrasOption[];
}

export const SAMPLE_MANIFEST: readonly SampleEntry[] = [
  {
    file: 'wall-hole.jpeg',
    description: 'A large hole in the drywall next to an outlet',
    location: 'Living room',
    duration: 'Just noticed today',
    extras: [],
  },
  {
    file: 'bathroom-tap.jpeg',
    description: 'Corrosion and mineral stains around the base of a bathroom tap',
    location: 'Bathroom',
    duration: 'A month or more',
    extras: ['Water stain or damp patch'],
  },
];

/** Rotation in manifest order; wraps after the last entry. */
export function nextSampleIndex(previous: number | null, length: number): number {
  return previous === null ? 0 : (previous + 1) % length;
}
