'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { InspectionPanel } from '@/components/intake/InspectionPanel';
import { StepOne } from '@/components/intake/StepOne';
import {
  LOCATION_FIRST_INPUT_ID,
  PLACE_TEXT_ID,
  StepTwo,
} from '@/components/intake/StepTwo';
import { StepThree } from '@/components/intake/StepThree';
import { StepProgress } from '@/components/intake/StepProgress';
import { useUpload } from '@/hooks/useUpload';
import { mapAnswers } from '@/lib/intake/answerMapper';
import { NO_FILES_MESSAGE, SAMPLE_FAILED_MESSAGE } from '@/lib/intake/copy';
import { initialIntakeState, intakeReducer, type IntakeAction } from '@/lib/intake/intakeReducer';
import { loadSample } from '@/lib/intake/loadSample';
import { SAMPLE_MANIFEST, nextSampleIndex } from '@/lib/intake/sampleManifest';
import { validateStep, type StepProblem } from '@/lib/intake/stepValidation';
import { HOME_LAYOUT, type HomeSectionId } from '@/lib/layout/sections';
import { prefersReducedMotion } from '@/lib/utils/prefersReducedMotion';
import { mergeSelection, type AcceptedFiles } from '@/lib/validation/mediaValidation';
import type { SafetyChipId } from '@/types/intake';

const NOTICE_PROMPT = 'Please read the notice below before sending.';

/** Moves focus to the control that a step problem is about, if it has one. */
function focusInvalid(problem: StepProblem): void {
  const id =
    problem.kind === 'no-location'
      ? LOCATION_FIRST_INPUT_ID
      : problem.kind === 'no-other-text'
        ? PLACE_TEXT_ID
        : null;
  if (id) document.getElementById(id)?.focus();
}

export function GuidedIntake() {
  const {
    answers,
    noticeVisible,
    uploadStatus,
    uploadError,
    errorKind,
    resetAt,
    fileProgress,
    files,
    canSubmit,
    setFiles,
    clearFiles,
    setAnswers,
    markNoticeVisible,
    submit,
    reset,
  } = useUpload();

  const [state, dispatch] = useReducer(intakeReducer, initialIntakeState);
  const { step, choices } = state;

  const [problem, setProblem] = useState<StepProblem | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const lastSampleIndex = useRef<number | null>(null);
  const sampleLoading = useRef(false);
  const previousStep = useRef(step);
  const pendingInvalid = useRef<StepProblem | null>(null);

  const hasFiles = files !== null && files.files.length > 0;
  const ready = canSubmit && hasFiles;
  const busy = uploadStatus === 'uploading' || uploadStatus === 'analysing';
  const liveNoticeActive = choices.safety.length > 0;

  // Keep useUpload's answers in step with the chips.
  const mapped = useMemo(() => mapAnswers(choices), [choices]);
  useEffect(() => {
    setAnswers(mapped);
  }, [mapped, setAnswers]);

  // On a step change (not on first render) move focus to the heading and scroll to it.
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = headingRef.current;
    if (!heading) return;
    const invalid = pendingInvalid.current;
    pendingInvalid.current = null;
    heading.focus({ preventScroll: true });
    if (typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
    if (invalid) focusInvalid(invalid);
  }, [step]);

  // After an error, the Homeowner is on Step 3 with everything kept.
  // Runs only when the status changes to 'error', so Back and Change still work while the error shows.
  const previousStatus = useRef(uploadStatus);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = uploadStatus;
    if (uploadStatus === 'error' && was !== 'error') dispatch({ type: 'goTo', step: 3 });
  }, [uploadStatus]);

  // Choosing a room clears the missing-room error straight away.
  const dispatchStepTwo = useCallback((action: IntakeAction) => {
    if (action.type === 'setLocation' && action.value !== null) {
      setProblem((p) => (p?.kind === 'no-location' ? null : p));
    }
    dispatch(action);
  }, []);

  const goNext = () => {
    const found = validateStep(step, { hasFiles, choices });
    if (found) {
      setProblem(found);
      focusInvalid(found);
      return;
    }
    setProblem(null);
    dispatch({ type: 'next' });
  };

  const goBack = () => {
    setProblem(null);
    setPrompt(null);
    dispatch({ type: 'back' });
  };

  const goTo = (target: 1 | 2) => {
    setProblem(null);
    setPrompt(null);
    dispatch({ type: 'goTo', step: target });
  };

  const handleFilesAccepted = useCallback(
    (accepted: AcceptedFiles) => {
      setFiles(accepted);
      setProblem(null);
      setSampleError(null);
    },
    [setFiles],
  );

  const handleCleared = useCallback(() => {
    // Removes the files only; the answers are kept.
    clearFiles();
    setProblem(null);
  }, [clearFiles]);

  const handleSample = async () => {
    if (sampleLoading.current) return;
    sampleLoading.current = true;
    const index = nextSampleIndex(lastSampleIndex.current, SAMPLE_MANIFEST.length);
    const entry = SAMPLE_MANIFEST[index];
    try {
      const file = await loadSample(entry);
      const merged = mergeSelection<File>(null, [file]);
      if (!merged.accepted || merged.errors.length > 0 || merged.files.length === 0) {
        setSampleError(merged.errors[0]?.message ?? SAMPLE_FAILED_MESSAGE);
        return;
      }
      setFiles({ kind: 'images', files: merged.files });
      dispatch({
        type: 'applySample',
        location: entry.location,
        duration: entry.duration,
        extras: entry.extras,
      });
      lastSampleIndex.current = index;
      setSampleError(null);
      setProblem(null);
    } catch {
      setSampleError(SAMPLE_FAILED_MESSAGE);
    } finally {
      sampleLoading.current = false;
    }
  };

  const handleSubmit = () => {
    if (busy) return;

    // Step 2 is checked again so a stale location is never sent.
    const step2Problem = validateStep(2, { hasFiles, choices });
    if (step2Problem) {
      setPrompt(null);
      setProblem(step2Problem);
      pendingInvalid.current = step2Problem;
      dispatch({ type: 'goTo', step: 2 });
      return;
    }

    if (!ready) {
      if (!hasFiles) {
        setPrompt(NO_FILES_MESSAGE);
      } else if (!noticeVisible) {
        setPrompt(NOTICE_PROMPT);
      } else {
        setPrompt(null);
      }
      if (!noticeVisible) {
        noticeRef.current?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
      }
      return;
    }
    setPrompt(null);
    void submit();
  };

  const currentStep = (
    <>
      {step === 1 && (
        <StepOne
          headingRef={headingRef}
          choices={choices}
          onToggleSafety={(id: SafetyChipId) => dispatch({ type: 'toggleSafety', id })}
          files={files}
          onFilesAccepted={handleFilesAccepted}
          onSelectionCleared={handleCleared}
          onSample={() => void handleSample()}
          sampleError={sampleError}
          problem={problem}
          onNext={goNext}
        />
      )}

      {step === 2 && (
        <StepTwo
          headingRef={headingRef}
          choices={choices}
          dispatch={dispatchStepTwo}
          problem={problem}
          liveNoticeActive={liveNoticeActive}
          onBack={goBack}
          onNext={goNext}
        />
      )}

      {step === 3 && (
        <StepThree
          headingRef={headingRef}
          choices={choices}
          answers={answers}
          files={files}
          liveNoticeActive={liveNoticeActive}
          uploadStatus={uploadStatus}
          fileProgress={fileProgress}
          uploadError={uploadError}
          errorKind={errorKind}
          resetAt={resetAt}
          notReady={!ready}
          prompt={prompt}
          onChange={goTo}
          onBack={goBack}
          onSubmit={handleSubmit}
          onTryAgain={reset}
          markNoticeVisible={markNoticeVisible}
          noticeRef={noticeRef}
        />
      )}
    </>
  );

  const sections: Record<HomeSectionId, ReactNode> = {
    'current-step': (
      <div key="current-step" data-section="current-step" className="min-w-0 space-y-6">
        <StepProgress step={step} />
        {currentStep}
      </div>
    ),
    'inspection-panel': (
      <InspectionPanel
        key="inspection-panel"
        step={step}
        choices={choices}
        files={files}
        onGoTo={goTo}
        busy={busy}
      />
    ),
  };

  // One DOM order for both layouts: left column, then right column (HOME_LAYOUT.phone).
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8 lg:space-y-0">
      {HOME_LAYOUT.phone.map((id) => sections[id])}
    </div>
  );
}
