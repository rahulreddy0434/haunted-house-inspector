import type { SafetyChipId } from '@/types/intake';

export interface SafetyChip {
  id: SafetyChipId;
  label: string;
  /** Fixed sentence sent to the server; contains no Homeowner input. */
  wording: string;
}

export const SAFETY_CHIPS: readonly SafetyChip[] = [
  {
    id: 'gas',
    label: 'I smell gas',
    wording: 'I smell gas.',
  },
  {
    id: 'electrical-fire',
    label: 'Sparks, or a burning smell from an outlet, switch or the electrical panel',
    wording: 'Sparks or a burning smell from an outlet, switch or the electrical panel.',
  },
  {
    id: 'water-electrical',
    label: 'Water near outlets, switches or the electrical panel',
    wording: 'There is water near an outlet, switch or the electrical panel.',
  },
  {
    id: 'co-alarm',
    label: 'A carbon monoxide (CO) alarm is going off',
    wording: 'A carbon monoxide (CO) alarm is going off.',
  },
];
