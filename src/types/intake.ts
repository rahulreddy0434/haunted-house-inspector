import type {
  DURATION_OPTIONS,
  EXTRAS_OPTIONS,
  LOCATION_OPTIONS,
} from '@/lib/intake/options';

export type LocationOption = (typeof LOCATION_OPTIONS)[number];
export type DurationOption = (typeof DURATION_OPTIONS)[number];
export type ExtrasOption = (typeof EXTRAS_OPTIONS)[number];
export type SafetyChipId = 'gas' | 'electrical-fire' | 'water-electrical' | 'co-alarm';
export type IntakeStep = 1 | 2 | 3;

/** Everything the Homeowner chooses or types. Files are held by useUpload, not here. */
export interface IntakeChoices {
  /** Any subset, kept in SAFETY_CHIPS order. */
  safety: readonly SafetyChipId[];
  location: LocationOption | null;
  /** Exact_Place_Text; it is Other_Text when location is 'Other'. */
  placeText: string;
  duration: DurationOption | null;
  /** Kept in EXTRAS_OPTIONS order. */
  extras: readonly ExtrasOption[];
  /** Kept in memory even while the "Something else" chip is off. */
  somethingElseText: string;
}

export interface IntakeState {
  step: IntakeStep;
  choices: IntakeChoices;
}
