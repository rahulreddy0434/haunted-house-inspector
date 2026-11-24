import { EXTRAS_OPTIONS } from '@/lib/intake/options';
import { SAFETY_CHIPS } from '@/lib/intake/safetyChips';
import type {
  DurationOption,
  ExtrasOption,
  IntakeChoices,
  IntakeState,
  IntakeStep,
  LocationOption,
  SafetyChipId,
} from '@/types/intake';

export type IntakeAction =
  | { type: 'toggleSafety'; id: SafetyChipId }
  | { type: 'setLocation'; value: LocationOption | null }
  | { type: 'setPlaceText'; value: string }
  | { type: 'setDuration'; value: DurationOption | null }
  | { type: 'toggleExtra'; value: ExtrasOption }
  | { type: 'setSomethingElseText'; value: string }
  | {
      type: 'applySample';
      location: LocationOption;
      duration: DurationOption;
      extras: readonly ExtrasOption[];
    }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goTo'; step: IntakeStep };

export const initialIntakeState: IntakeState = {
  step: 1,
  choices: {
    safety: [],
    location: null,
    placeText: '',
    duration: null,
    extras: [],
    somethingElseText: '',
  },
};

const SAFETY_ORDER: readonly SafetyChipId[] = SAFETY_CHIPS.map((c) => c.id);

function clampStep(n: number): IntakeStep {
  return (n <= 1 ? 1 : n >= 3 ? 3 : 2) as IntakeStep;
}

function toggled<T>(
  current: readonly T[],
  value: T,
  order: readonly T[],
): readonly T[] {
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return order.filter((v) => next.includes(v));
}

function withChoices(state: IntakeState, patch: Partial<IntakeChoices>): IntakeState {
  return { ...state, choices: { ...state.choices, ...patch } };
}

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'next':
      return { ...state, step: clampStep(state.step + 1) };
    case 'back':
      return { ...state, step: clampStep(state.step - 1) };
    case 'goTo':
      return { ...state, step: clampStep(action.step) };
    case 'toggleSafety':
      return withChoices(state, {
        safety: toggled(state.choices.safety, action.id, SAFETY_ORDER),
      });
    case 'setLocation':
      return withChoices(state, { location: action.value });
    case 'setPlaceText':
      return withChoices(state, { placeText: action.value });
    case 'setDuration':
      return withChoices(state, { duration: action.value });
    case 'toggleExtra':
      // somethingElseText is deliberately left alone, even when the chip goes off.
      return withChoices(state, {
        extras: toggled(state.choices.extras, action.value, EXTRAS_OPTIONS),
      });
    case 'setSomethingElseText':
      return withChoices(state, { somethingElseText: action.value });
    case 'applySample':
      return withChoices(state, {
        location: action.location,
        duration: action.duration,
        extras: EXTRAS_OPTIONS.filter((o) => action.extras.includes(o)),
      });
  }
}
