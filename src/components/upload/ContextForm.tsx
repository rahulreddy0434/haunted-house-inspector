'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ContextAnswers } from '@/types/inspection';
import {
  MAX_ANSWER_LENGTH,
  clampAnswer,
  isLocationValid,
} from '@/lib/utils/contextAnswers';

export interface ContextFormProps {
  value: ContextAnswers;
  onChange: (answers: ContextAnswers) => void;
  onValidationChange: (valid: boolean) => void;
  /** Show the location error even if the field was not touched (e.g. after a failed submit). */
  showErrors?: boolean;
}

const fieldClasses =
  'mt-1 block w-full rounded-lg border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 ' +
  'placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ' +
  'haunted:border-haunted-border haunted:bg-haunted-surface haunted:text-haunted-text haunted:placeholder:text-haunted-muted ' +
  'haunted:focus-visible:ring-haunted-accent haunted:focus-visible:ring-offset-haunted-bg';

const labelClasses = 'block text-base font-medium text-gray-900 haunted:text-haunted-text';
const hintClasses = 'font-normal text-gray-600 haunted:text-haunted-muted';
const counterClasses = 'mt-1 text-sm text-gray-600 haunted:text-haunted-muted';

export function ContextForm({
  value,
  onChange,
  onValidationChange,
  showErrors = false,
}: ContextFormProps) {
  const uid = useId();
  const [locationTouched, setLocationTouched] = useState(false);

  const locationValid = isLocationValid(value.location);

  // Report validity on mount and whenever it changes.
  const callbackRef = useRef(onValidationChange);
  callbackRef.current = onValidationChange;
  useEffect(() => {
    callbackRef.current(locationValid);
  }, [locationValid]);

  const showLocationError = (locationTouched || showErrors) && !locationValid;

  const ids = {
    location: `${uid}-location`,
    duration: `${uid}-duration`,
    recentChanges: `${uid}-recent`,
  };

  const update = (field: keyof ContextAnswers, text: string) => {
    onChange({ ...value, [field]: clampAnswer(text) });
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={ids.location} className={labelClasses}>
          Where in your home is the problem?{' '}
          <span className={hintClasses}>(required)</span>
        </label>
        <textarea
          id={ids.location}
          name="location"
          rows={2}
          maxLength={MAX_ANSWER_LENGTH}
          required
          aria-required="true"
          aria-invalid={showLocationError}
          aria-describedby={`${ids.location}-count${showLocationError ? ` ${ids.location}-error` : ''}`}
          value={value.location}
          onChange={(e) => update('location', e.target.value)}
          onBlur={() => setLocationTouched(true)}
          className={fieldClasses}
        />
        <p id={`${ids.location}-count`} className={counterClasses}>
          {value.location.length}/{MAX_ANSWER_LENGTH}
        </p>
        <div id={`${ids.location}-error`} role="alert">
          {showLocationError && (
            <p className="mt-1 text-sm font-medium text-red-700 haunted:text-red-300">
              Please tell us where the problem is.
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={ids.duration} className={labelClasses}>
          How long has this been going on?{' '}
          <span className={hintClasses}>(optional)</span>
        </label>
        <textarea
          id={ids.duration}
          name="duration"
          rows={2}
          maxLength={MAX_ANSWER_LENGTH}
          aria-describedby={`${ids.duration}-count`}
          value={value.duration}
          onChange={(e) => update('duration', e.target.value)}
          className={fieldClasses}
        />
        <p id={`${ids.duration}-count`} className={counterClasses}>
          {value.duration.length}/{MAX_ANSWER_LENGTH}
        </p>
      </div>

      <div>
        <label htmlFor={ids.recentChanges} className={labelClasses}>
          Anything else we should know? For example smells, sounds, sparks or recent changes.{' '}
          <span className={hintClasses}>(optional)</span>
        </label>
        <textarea
          id={ids.recentChanges}
          name="recentChanges"
          rows={3}
          maxLength={MAX_ANSWER_LENGTH}
          aria-describedby={`${ids.recentChanges}-count`}
          value={value.recentChanges}
          onChange={(e) => update('recentChanges', e.target.value)}
          className={fieldClasses}
        />
        <p id={`${ids.recentChanges}-count`} className={counterClasses}>
          {value.recentChanges.length}/{MAX_ANSWER_LENGTH}
        </p>
      </div>
    </div>
  );
}
