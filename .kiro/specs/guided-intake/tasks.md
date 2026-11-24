# Implementation Plan: Guided Intake

## Overview

This plan replaces the single long form on the Home_Page with the three-step Guided_Intake, in TypeScript, following the design's "Order of work for the tasks phase". Safety comes first: Safety_Wording, the Answer_Mapper and their tests are built before any UI, then the Live_Emergency_Notice. Each parent task leaves the app working and the tests passing. `useUpload`, `runUploadFlow`, `DropZone`, `DataRetentionNotice` and `EmergencyBanner` are reused unchanged. Chips are native radio and checkbox inputs with no custom keyboard code. Nothing in `src/lib/safety/`, `src/lib/emergency/messages.ts` or `src/app/api/inspect/route.ts` is edited.

Property tests for Properties 1, 2, 3, 4, 5 and 8 are required. So are the other tests that Requirement 13 lists (route test, mapping examples, Back/Next keeps choices, keyboard use of every chip group, Sample_Button, Live_Emergency_Notice, real progress stages). Properties 6, 7, 9, 10, 11 and 12 and a few extra component tests are optional (marked with `*`).

## Tasks

- [x] 1. Safety foundations: types, Safety_Wording and Answer_Mapper
  - [x] 1.1 Add shared types, option lists and Safety_Wording
    - Create `src/types/intake.ts` (`LocationOption`, `DurationOption`, `ExtrasOption`, `SafetyChipId`, `IntakeStep`, `IntakeChoices`, `IntakeState`)
    - Create `src/lib/intake/options.ts` with the `as const` Location, Duration and Extras lists, `OTHER_LOCATION` and `SOMETHING_ELSE`
    - Create `src/lib/intake/safetyChips.ts` with `SAFETY_CHIPS` (id, label, constant Safety_Wording) exactly as in the design
    - Named exports only; no edits under `src/lib/safety/`
    - _Requirements: 1.3, 5.2, 7.1, 7.3_

  - [x] 1.2 Implement the pure Answer_Mapper
    - Create `src/lib/intake/answerMapper.ts` with `mapAnswers`, `exactPlaceLimit`, `somethingElseLimit`, `cleanFreeText`, `truncateUtf16`
    - Safety_Wording goes first in `recentChanges`; only Free_Text is ever shortened; truncation never splits a code point; no time or randomness
    - Output goes through the existing `ContextAnswers` type
    - _Requirements: 1.1, 1.6, 1.7, 5.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9_

  - [x] 1.3 Add shared fast-check arbitraries
    - Create `src/lib/intake/testArbitraries.ts` with `arbIntakeChoices` (option lists, Unicode, emoji, zero-width characters, tabs and newlines, text up to about 2,000 characters)
    - _Requirements: 13.1, 13.3_

  - [x] 1.4 Write property test for Safety_Chips and the Safety_Layer
    - **Property 1: Any Safety_Chip makes the server-side check return an emergency**
    - Use the real `checkEmergency`, at least 100 runs, non-empty subsets with any other choices and Free_Text
    - File: `src/lib/intake/answerMapper.safety.property.test.ts`
    - **Validates: Requirements 1.2, 13.1**

  - [x] 1.5 Write property test for Safety_Wording placement
    - **Property 2: Safety_Wording leads `recentChanges` verbatim, and appears only when chosen**
    - Include a case with 2,000-character Free_Text; with no Safety_Chip, no Answer_String contains any Safety_Wording
    - File: `src/lib/intake/answerMapper.wording.property.test.ts`
    - **Validates: Requirements 1.1, 1.6, 1.7**

  - [x] 1.6 Write property test that chip labels alone never trigger an emergency
    - **Property 3: Chip labels alone never trigger an emergency**
    - No Safety_Chip and empty Free_Text; add an exhaustive example over every single label and every pair of Extras
    - File: `src/lib/intake/answerMapper.noFalseEmergency.property.test.ts`
    - **Validates: Requirements 7.11**

  - [x] 1.7 Write property test for answer length
    - **Property 4: Answer strings never exceed 500 characters, and only free text is shortened**
    - Check length at most 500, no lone surrogate, fixed parts present in full, determinism
    - File: `src/lib/intake/answerMapper.length.property.test.ts`
    - **Validates: Requirements 7.6, 7.7, 7.9, 13.3**

  - [x] 1.8 Write property test for schema compatibility
    - **Property 5: Mapped answers pass the existing request schema**
    - Use `contextAnswersSchema.safeParse` with a valid location
    - File: `src/lib/intake/answerMapper.schema.property.test.ts`
    - **Validates: Requirements 7.8, 13.3**

  - [x] 1.9 Write route test for Safety_Wording over the rate limit
    - Create `src/app/api/inspect/route.guidedIntake.test.ts`, modelled on `route.emergencyOverLimit.test.ts`
    - Build bodies with `mapAnswers` for each single Safety_Chip and for all four; counter mock reports the limit used up; assert the emergency result and that the rate limiter and Bedrock mocks are not called; add a control case with clean chip answers that returns 429
    - Do not edit the route handler
    - _Requirements: 1.4, 13.2_

  - [x] 1.10 Write example tests for Safety_Wording and the mapping
    - `safetyChips.test.ts`: each sentence alone makes `checkEmergency` true, contains no user input, and the worst-case fixed `recentChanges` is at most 498 characters
    - `answerMapper.test.ts`: "Kitchen: under the sink", "Kitchen", "Other: text", "A few weeks", and "Dripping or leaking water. Getting worse. text"
    - _Requirements: 1.3, 7.1, 7.2, 7.3, 7.4, 13.4_

  - [ ]* 1.11 Write property tests for format and cleaning
    - **Property 6: The three strings follow the documented format** (separate reference model inside the test)
    - **Property 7: Free text is cleaned**
    - File: `src/lib/intake/answerMapper.format.property.test.ts`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

  - [x] 1.12 Write prompt test for chip answers
    - Create `src/lib/prompts/inspectPrompt.guidedIntake.test.ts`: prompts built from several `mapAnswers` outputs still contain every safety line (danger signs, answers-as-information, never return emergency, no DIY for gas, electrical and heating, likely diagnosis)
    - Leave `buildInspectPrompt` unchanged unless a test shows a misread
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. State, validation and samples (pure modules)
  - [ ] 3.1 Implement the reducer, step validation and fixed copy
    - Create `src/lib/intake/intakeReducer.ts` (`IntakeAction`, `initialIntakeState`, `intakeReducer`); `next`, `back` and `goTo` change only `step` and keep the same `choices` object; toggles keep canonical order; deselecting "Something else" keeps its text; `applySample` replaces only location, duration and extras
    - Create `src/lib/intake/stepValidation.ts` (`validateStep`, `StepProblem`)
    - Create `src/lib/intake/copy.ts` with the fixed messages (no-files, no-location, no-other-text, sample failed)
    - _Requirements: 3.7, 3.8, 3.10, 3.11, 5.5, 5.6, 5.10, 5.12, 9.4, 9.6_

  - [ ] 3.2 Implement Sample_Manifest and `loadSample`
    - Create `src/lib/intake/sampleManifest.ts` with exactly two typed entries (no safety field), `nextSampleIndex`
    - Create `src/lib/intake/loadSample.ts` that fetches `/samples/<file>` and returns a `File`, throwing on failure
    - _Requirements: 9.2, 9.3, 9.5, 9.8, 9.9, 9.10_

  - [ ] 3.3 Write property test that Back and Next keep choices
    - **Property 8: Next, Back and Change never alter the choices**
    - Sequences of `next`, `back` and `goTo`; same `choices` reference; step always 1, 2 or 3
    - File: `src/lib/intake/intakeReducer.navigation.property.test.ts`
    - **Validates: Requirements 3.10, 3.11, 8.2, 13.5**

  - [ ]* 3.4 Write property tests for toggles and samples
    - **Property 9: Toggling twice restores the choices, and the Something_Else_Text survives**
    - **Property 11: A sample replaces only its three groups**
    - File: `src/lib/intake/intakeReducer.property.test.ts`
    - **Validates: Requirements 5.5, 5.10, 9.4, 9.5, 9.6**

  - [ ]* 3.5 Write property test for step validation
    - **Property 10: Step 2 asks only for a location**
    - File: `src/lib/intake/stepValidation.property.test.ts`
    - **Validates: Requirements 3.8, 5.12**

  - [ ]* 3.6 Write property test for sample rotation
    - **Property 12: Sample rotation follows the manifest order and wraps**
    - File: `src/lib/intake/sampleManifest.property.test.ts`
    - **Validates: Requirements 9.3**

  - [ ] 3.7 Write Sample_Manifest tests
    - `sampleManifest.test.ts`: exactly two entries; every listed file exists in `public/samples/` and every file there has an entry; types and sizes pass media validation; chosen labels are members of the option lists; no entry pre-selects a Safety_Chip; `loadSample` rejects on a failed fetch
    - _Requirements: 9.5, 9.8, 9.9, 9.10_

- [ ] 4. Chips, text fields and the Live_Emergency_Notice
  - [ ] 4.1 Build `ChipGroup`, `FreeTextField` and `StepHeading`
    - Create `src/components/intake/ChipGroup.tsx`: `fieldset` with `aria-labelledby` pointing to the legend's `id`; `role="radiogroup"` on single-choice groups; native `input type="radio"` or `checkbox` with `peer` and a label as the chip; real `aria-hidden` check mark; `min-h-11 min-w-11`; wrapping text; `peer-checked:` and `peer-focus-visible:` styles with `haunted:` partners; "Clear" button for single-choice groups; error slot with `aria-invalid` and `aria-describedby`
    - Create `FreeTextField.tsx` (label, counter, limit, error, over-limit note) and `StepHeading.tsx` (`h2`, `tabIndex={-1}`, ref)
    - No `onKeyDown`, `onKeyUp`, `onKeyPress`, `role="radio"` or `role="checkbox"`; no hex or rgb colours; no `animate-`, `transition` or `duration-` classes
    - _Requirements: 3.9, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.11, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 11.2, 11.5_

  - [ ] 4.2 Build `LiveEmergencyNotice`
    - Create `src/components/intake/LiveEmergencyNotice.tsx` that renders the existing `EmergencyBanner` with `urgency="emergency"` while `active` is true; no copy of the message text, no `haunted:` classes, no focus movement
    - Leave `EmergencyBanner` unchanged
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 11.7_

  - [ ] 4.3 Write ChipGroup tests for names and keyboard
    - `ChipGroup.test.tsx` with user-event: `getByRole('radiogroup', { name })` for single-choice groups and `getByRole('group', { name })` for multi-choice groups; each fieldset's `aria-labelledby` equals its legend's `id`; Tab stops, arrow keys in radio groups, Space on checkboxes; single-choice replaces and Clear works; multi-choice toggles off
    - _Requirements: 5.3, 5.5, 5.6, 6.2, 6.3, 6.9, 6.10_

  - [ ] 4.4 Write Live_Emergency_Notice test
    - `LiveEmergencyNotice.test.tsx`: text equals `EMERGENCY_MESSAGE` exactly, `role="alert"`, no class token starting with `haunted:`, same text after a theme toggle, nothing rendered when inactive
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.7, 2.8, 13.8_

  - [ ] 4.5 Write source guard for the intake components
    - `src/components/intake/intakeSource.test.ts` reads `src/components/intake/*.tsx` and fails on `onKeyDown`, `onKeyUp`, `onKeyPress`, `role="radio"` and `role="checkbox"`
    - _Requirements: 6.2, 6.3_

- [ ] 5. Upload status panel
  - [ ] 5.1 Extract `UploadStatusPanel` and move `prefersReducedMotion`
    - Create `src/components/upload/UploadStatusPanel.tsx` by copying the stage and error JSX from `UploadFlow.tsx`; one `role="status"` region; "Uploading photos" while uploading (existing `UploadProgress` below); "Checking for safety and reading your photos" with `StateText hauntedKey="inspecting"` while analysing; focus moves to the stage heading when analysing starts; existing error cards and "Try again" unchanged
    - Create `src/lib/utils/prefersReducedMotion.ts` and import it from `UploadFlow.tsx`
    - Change `UploadFlow.tsx` to use the panel and update its existing tests for the new stage text, so the page still works
    - Do not change `useUpload` or `runUploadFlow`
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_

  - [ ] 5.2 Write UploadStatusPanel tests
    - Stage text from real status values, no timer (advance fake timers, text unchanged), focus on the stage heading, Haunted line appended, error card and "Try again"
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7, 13.9_

- [ ] 6. Steps, `GuidedIntake` and the page
  - [ ] 6.1 Build `StepProgress`, `ReviewList` and `SampleButton`
    - `StepProgress.tsx`: "Step N of 3", `role="progressbar"` with `aria-valuenow`, width-only inline style, no transition
    - `ReviewList.tsx`: Safety labels or "None selected", thumbnails (object URLs revoked on cleanup), `answers.location`, `answers.duration`, extras, each with a Change button
    - `SampleButton.tsx`: "Try it with a sample photo"
    - _Requirements: 3.2, 8.1, 8.2, 9.1, 11.4_

  - [ ] 6.2 Build `StepOne`, `StepTwo` and `StepThree`
    - Step 1 order: heading, Safety_Group, Live_Emergency_Notice, `DropZone`, Sample_Button (only while no file), error, Next
    - Step 2 order: heading, notice, Location_Group with Exact_Place_Text (required when Other), Duration_Group, Extras_Group with Something_Else_Text (only while the chip is on), error, Back, Next
    - Step 3 order: heading, notice, `ReviewList`, `DataRetentionNotice`, status panel, Back, "Inspect my home"
    - _Requirements: 2.2, 3.1, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.7, 5.8, 5.9, 5.10, 5.11, 5.13, 8.3, 8.6, 8.7_

  - [ ] 6.3 Build `GuidedIntake` and switch the page
    - Create `GuidedIntake.tsx`: `useUpload()` plus `useReducer(intakeReducer)`; `mapAnswers` memoised and pushed with `setAnswers` in an effect; Next and Back with `validateStep`; focus and scroll to the heading on step change (not on first render; no smooth scroll under reduced motion); focus the first invalid control; sample handler using `loadSample` and `mergeSelection`, rotation index moved only on success; `handleSubmit` with the existing notice prompt and a re-check of Step 2; send through `submit()` and `buildInspectRequestBody`
    - Change `src/app/page.tsx` to render `GuidedIntake`, keeping the `h1`, intro text and `HelpSection`
    - Leave `useUpload`, `runUploadFlow`, `DropZone` and `DataRetentionNotice` unchanged
    - _Requirements: 3.3, 3.7, 3.8, 3.9, 3.11, 3.12, 3.13, 1.5, 7.10, 8.4, 8.5, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8, 10.3, 10.6_

  - [ ] 6.4 Write test that Back and Next keep every answer
    - `GuidedIntake.navigation.test.tsx`: add a file, tap Safety, Location, Duration and Extras chips, type all three Free_Text values, go to Step 3, go Back twice and forward again; every file, chip and text value is still present; Change links keep the state; Something_Else_Text survives deselect and reselect
    - _Requirements: 3.10, 3.11, 5.10, 8.2, 13.5_

  - [ ]* 6.5 Write step flow tests
    - `GuidedIntake.steps.test.tsx`: titles, "Step N of 3" and `aria-valuenow`, Back and Next per step, focus on the heading, scroll behaviour with and without reduced motion, error messages with `aria-invalid` and `aria-describedby`, focus on the first invalid control, notice shown on Steps 1, 2 and 3 in the right place, send still allowed with a Safety_Chip
    - _Requirements: 1.5, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.12, 3.13, 6.7, 8.4_

  - [ ] 6.6 Write keyboard tests for all four chip groups
    - `GuidedIntake.keyboard.test.tsx`: Safety_Group on Step 1; Location_Group, Duration_Group and Extras_Group on Step 2; Tab order, arrow keys in single-choice groups, Space on each chip, one Tab stop per checkbox; Back and Next reachable by Tab; group names checked with `getByRole`
    - _Requirements: 6.1, 6.2, 6.3, 6.10, 13.6_

  - [ ] 6.7 Write Sample_Button tests
    - `SampleButton.test.tsx`: shown only while no file and on Step 1 only; adds exactly one file through the normal validation; pre-selects the manifest answers on Step 2 where they can be changed or cleared; selects no Safety_Chip; leaves Safety_Group and Free_Text unchanged; rotates in manifest order and wraps (remove the sample, tap again, get the other one); failed fetch shows "We couldn't load the sample photo. Please add your own photo." and changes nothing
    - _Requirements: 4.4, 4.5, 5.13, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 13.7_

  - [ ] 6.8 Write real-stage and Live_Emergency_Notice placement tests
    - `GuidedIntake.stages.test.tsx` with `runUploadFlow` mocked: "Uploading photos" with progress from `onProgress`, analysis text only after `onAnalysing`, no text change when timers advance, Back and "Inspect my home" disabled while running, errors keep the state and return to Step 3, "Try again" works
    - Notice placement: directly below the Safety_Group on Step 1 before any file is added, at the top of Step 2 and Step 3, exact `EMERGENCY_MESSAGE`, no `haunted:` class, focus stays on the chip
    - _Requirements: 2.1, 2.2, 8.6, 8.7, 10.1, 10.2, 10.4, 10.6, 13.8, 13.9_

  - [ ]* 6.9 Write request body test
    - Read the `fetch` body sent by `runUploadFlow` from `GuidedIntake` and check it has the same shape and the three answer fields from `mapAnswers`
    - _Requirements: 7.10_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Theme contrast and source scan
  - [ ] 8.1 Add Contrast_Registry rows
    - In `src/lib/haunted/contrastRegistry.ts`, add rows only for pairs not yet listed: unselected chip text, chip border, selected chip border against fill, progress fill against track, "Step N of 3" text, focus ring against page and selected fill, in both themes; reuse existing rows (for example `F-01`, `F-02` for the emergency banner); the existing `checkRegistry` test must pass
    - _Requirements: 6.4, 11.2, 11.3_

  - [ ] 8.2 Extend the source scan (additions only)
    - In `src/components/sourceScan.test.ts`, add `src/components/intake` and `src/components/upload/UploadStatusPanel.tsx` to the scanned set
    - Never remove a file from the scan and never loosen a rule
    - _Requirements: 11.2, 11.5, 11.6_

  - [ ]* 8.3 Write ChipGroup class check
    - Assert `min-h-11`, `min-w-11`, `peer-focus-visible:` and `peer-checked:` are present, `truncate` is absent, and the notice file has no `haunted:` class
    - _Requirements: 2.4, 6.4, 6.6, 6.8_

- [ ] 9. Cleanup of the old form
  - [ ] 9.1 Migrate the old UploadFlow tests
    - Rewrite the cases in `UploadFlow.test.tsx` (notice prompt, rate limit card, upload, timeout and analysis error cards, retry) against `GuidedIntake` before anything is deleted; the `ContextForm` rules are already covered by Properties 4, 5 and 7 and the mapper examples
    - _Requirements: 8.4, 8.5, 10.6_

  - [ ] 9.2 Delete the old components and their tests
    - Only after 9.1 passes, delete `src/components/upload/UploadFlow.tsx`, `src/components/upload/ContextForm.tsx` and their test files; fix any remaining imports
    - In `src/components/ui/normalBaseline.test.ts`, remove only the `'upload/UploadFlow.tsx'` and `'upload/ContextForm.tsx'` entries and change nothing else in that test
    - _Requirements: 3.13, 11.6_

- [ ] 10. Final checkpoint - Run lint, type check and tests
  - Run `next lint`, `tsc --noEmit` and `vitest --run`, fix failures, and ensure all pass; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Properties 1, 2, 3, 4, 5 and 8 are required and are not marked optional; they map to Requirements 1.2, 1.1/1.6/1.7, 7.11, 7.7, 7.8 and 3.10.
- Required tests also include the Requirement 13 route test, mapping examples, keyboard test for all four chip groups, Sample_Button tests, notice test and stage test.
- Each property test uses fast-check with at least 100 runs and a tag comment `// Feature: guided-intake, Property N: ...`.
- No task edits `src/lib/safety/`, `src/lib/emergency/messages.ts` or `src/app/api/inspect/route.ts`.
- Run `next lint`, `tsc --noEmit` and `vitest --run` after each parent task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12"] },
    { "id": 4, "tasks": ["2"] },
    { "id": 5, "tasks": ["3.1", "3.2"] },
    { "id": 6, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 7, "tasks": ["4.1", "4.2", "5.1"] },
    { "id": 8, "tasks": ["4.3", "4.4", "4.5", "5.2"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["6.2"] },
    { "id": 11, "tasks": ["6.3"] },
    { "id": 12, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 13, "tasks": ["7"] },
    { "id": 14, "tasks": ["8.1", "8.2"] },
    { "id": 15, "tasks": ["8.3"] },
    { "id": 16, "tasks": ["9.1"] },
    { "id": 17, "tasks": ["9.2"] },
    { "id": 18, "tasks": ["10"] }
  ]
}
```
