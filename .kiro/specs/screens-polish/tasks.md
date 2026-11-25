# Implementation Plan: screens-polish

## Overview

This plan makes the live App match the eight mockups in `docs/design/`, in TypeScript on the existing Next.js stack. It changes styling, layout and small interactions, plus one safety addition (the saved Emergency_Rule and Emergency_Source, Requirement 18). The parent tasks follow the order set in the requirements: tokens and fonts, header and footer, emergency reason, home, result, booking and tracker, Pro list, Pro job page, Haunted check, final checkpoint.

Rules that apply to every task:

- Do not edit `src/lib/safety/`, `EMERGENCY_MESSAGE` or `src/components/sourceScan.test.ts`. `sourceScan.test.ts` must pass unchanged at the end of every parent task, so no component file may contain a hex or rgb colour, an `animate-`, `transition` or `duration-` class.
- No new npm package. The only new files outside `src/` are the user-supplied Inter font files and `OFL.txt` in `src/assets/fonts/inter/`.
- Each parent task ends with a verify sub-task. `next lint`, `tsc --noEmit` and `vitest --run` must pass before the next parent task starts.
- Every existing test that a task changes on purpose is named in that task. Unnamed existing tests must keep passing as they are.
- The Normal_Baseline_Test (`src/components/ui/normalBaseline.test.ts`) and the Contrast_Registry (`src/lib/haunted/contrastRegistry.ts`) updates are required sub-tasks, not optional, because the existing tests fail without them.
- Sub-tasks marked `*` are new tests that can be skipped for a faster MVP. Test changes that keep existing tests green are not marked `*`.

## Tasks

- [x] 1. Tokens and fonts
  - [x] 1.1 Load Inter from the repository
    - `Inter-Variable.ttf` and `OFL.txt` already exist in `src/assets/fonts/inter/`. Do not download fonts and do not add static weight files.
    - In `src/app/fonts.ts`, add `bodyFont` with `next/font/local`, a single `src` entry pointing at `Inter-Variable.ttf`, `weight: '400 700'`, `style: 'normal'`, variable `--font-body`, `display: 'swap'` and fallback `system-ui, sans-serif`.
    - In `src/app/layout.tsx`, add `bodyFont.variable` to the `<html>` class list beside the Display_Font variable.
    - In `src/app/globals.css`, set the body font to `var(--font-body, system-ui, sans-serif)`.
    - Keep the Display_Font for Haunted headings only. Add no third-party font `<link>`.
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Define the Normal_Palette Theme_Tokens and recipes
    - In `tailwind.config.ts`, add `theme.extend.colors.normal` with `page #F6F7F9`, `card #FFFFFF`, `card-border #D9DEE5`, `text #18212B`, `muted #55606E`, `accent #1F5FA8`, `accent-hover #174A84` and `emergency #B42318`. Add the 14 px card radius token. Set `fontFamily.sans` to `var(--font-body)`, `system-ui`, `sans-serif`. Leave the `haunted.*` tokens unchanged.
    - Add the urgency badge colours (Soon `#FEF0C7` on `#7A4F01`, Urgent `#FCE3D3` on `#9A3412`, Monitor `#DCF5E6` on `#14532D`, Emergency `#B42318` on `#FFFFFF`) and the table header `#EEF1F5`, emergency row `#FEF3F2` and notice `#EEF4FB` / `#C9DAEE` colours as tokens.
    - Create `src/lib/theme/tokens.ts` with typed constants for the urgency meter, tracker and Filter_Chip token names.
    - In `src/components/ui/styles.ts`, add `PAGE_BG`, `CARD_14`, `MUTED_TEXT`, `ACCENT_TEXT`, `ACCENT_BUTTON` (with `hover:` and `active:` classes), `URGENCY_METER_COLORS`, `FILTER_CHIP_COLORS` and `STICKY_PANEL`. `STICKY_PANEL` applies sticky positioning only through a custom min-height screen named `tall` (raw media query `(min-height: 900px) and (min-width: 1024px)`, with the height set to the tallest panel plus the header), added to `tailwind.config.ts`. Below that height the panel is a normal block that scrolls with the page, and no `overflow-y-auto`, `max-height` or inner scroll box is used. Keep the `haunted:` pairing on each recipe. Switch the existing shared recipes to the new Normal tokens.
    - Use the new tokens only through classes. Put no hex or rgb value in any component file.
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 7.4, 13.2_

  - [x] 1.3 Update the Normal_Baseline_Test on purpose
    - In `src/components/ui/normalBaseline.test.ts`, update the locked Normal-theme classes for every file whose classes changed in 1.2.
    - Add a comment at the top of the file that lists, per file, each added, removed or renamed class.
    - _Requirements: 1.9, 15.2_

  - [x] 1.4 Add base-palette rows to the Contrast_Registry
    - In `src/lib/haunted/contrastRegistry.ts`, add rows for text on page background, muted text on card, accent text, accent button text, the focus ring and the four urgency badge pairs, in both themes where the pair appears in both.
    - The existing registry property test must pass over the new rows unchanged.
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 1.5 Verify task 1
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Fix any failure. `sourceScan.test.ts` must pass unchanged.
    - _Requirements: 14.6, 15.12_

- [x] 2. Header and footer
  - [x] 2.1 Extract SiteHeader and SiteFooter
    - Create `src/components/ui/SiteHeader.tsx`: title "Haunted House Inspector", the Haunted_Switch (it already hides itself on an Emergency_Page through the existing `inEmergency` handling), an optional "PRO" tag and an optional "Log out" button. Put the "Skip to main content" link first in focus order. The Haunted_Switch has a touch target of at least 44 px.
    - Create `src/components/ui/SiteFooter.tsx` with "Estimates only. Not a professional inspection." and the Weekly_Reset_Link to `https://www.weeklyresetwr.com` with `rel="noopener noreferrer"`.
    - Replace the inline header and footer in `src/app/layout.tsx` with the two components. Give the page one `main` with the id the skip link targets.
    - Follow the mockup spacing and sizes at 390 px. Keep a 1120 px centred column for the header content on Pro pages.
    - _Requirements: 2.1, 2.2, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 2.2 Add the Pro chrome context
    - Create `src/components/pro/ProChromeContext.tsx` and `src/components/pro/ProChrome.tsx`, following the existing `EmergencyScope` registration pattern. `ProChrome` registers the "PRO" tag and the logout callback. `SiteHeader` reads the context.
    - Wrap `ProDashboard.tsx` and `JobDetail.tsx` content in `ProChrome`. Show "Log out" only for a signed-in Pro_User, never on the access code form. Remove the body-level "Log out" button. Keep the existing logout route call and the return to the access code form.
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 2.3 Update the Normal_Baseline_Test for the header and footer
    - Update `normalBaseline.test.ts` for the changed header, footer and Pro page classes. List each changed class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [x] 2.4 Add header and footer rows to the Contrast_Registry
    - Add rows for the header title, the PRO tag, the Log out button, the Haunted_Switch and the footer link, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 2.5 Write unit tests for the header and footer
    - Title and switch on a normal page. Title only on an Emergency_Page. "PRO" tag on both Pro pages. "Log out" only when signed in, and not duplicated in the page body. Footer text and link attributes on every page type, including an Emergency_Page. One `main` and a working skip link.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 2.9_

  - [x] 2.6 Verify task 2
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Fix any failure.
    - _Requirements: 15.12_

- [x] 3. Emergency reason
  - [x] 3.1 Add the reasons file and the source type
    - Create `src/lib/emergency/reasons.ts` with the four fixed sentences keyed by `EmergencyConditionCode` and the total function `emergencyReasonSentence(code: string | undefined)`. Import only the type from `safetyLayer.ts`.
    - Create `src/lib/emergency/source.ts` with `export type EmergencySource = 'precheck' | 'postcheck' | 'override'`.
    - Do not edit `messages.ts` or anything in `src/lib/safety/`.
    - _Requirements: 18.5, 18.6, 18.9_

  - [x] 3.2 Add the optional fields to types and Zod schemas
    - Add optional `emergencyRule` and `emergencySource` to `InspectionResult` in `src/types/inspection.ts`, and to `inspectionResultSchema` and `storedJobSchema`.
    - Add optional `reasonSentence` to the emergency variant of `HomeownerStatusView`, to `ProJobDetailEmergency` and to their schemas in `src/lib/validation/jobSchema.ts`, to `ChatEmergencyResponse` in `src/types/chat.ts`, and to the 409 `JOB_IS_EMERGENCY` body shape.
    - No field is renamed, removed or retyped. List each changed shape in a comment on the task commit message or `BUILD_LOG.md`.
    - _Requirements: 18.1, 18.11, 18.12_

  - [x] 3.3 Save the rule and source at the three write paths
    - Do not edit `src/lib/safety/replyCheck.ts`, because it is under `src/lib/safety/`. Create the Emergency_Rule_Wrapper in `src/lib/emergency/ruleWrapper.ts`, outside `src/lib/safety/`: `emergencyRuleFor(text)` calls the unchanged `checkEmergency` with the same input that `replyTriggersEmergency` uses and returns `{ isEmergency, rule }`. The wrapper must not change any decision. The routes (`reply/route.ts` and `chatRoute.ts`) keep deciding with `replyTriggersEmergency(text)`, and only when it returns true do they call the wrapper to get the rule code. This replaces the design's earlier plan to change the return type of `replyTriggersEmergency`.
    - In `src/lib/aws/jobs.ts`, give `applySafetyOverride` a `triggeredCondition` parameter. Add `emergencyRule` and `emergencySource = 'override'` to the same gated update expression that `OVERRIDE_NOT_EMERGENCY` already protects.
    - In `src/app/api/inspect/route.ts`, set `emergencyRule` from `triggeredCondition` and `emergencySource` to `'precheck'` or `'postcheck'` when the result is an emergency, in the object assembled after `applyOverrides`. Leave `applyOverrides` unchanged.
    - Adding `emergencyRule` and `emergencySource` must not change the order of steps in `POST /api/inspect`: the pre-check stays before the rate limiter and before Bedrock. The existing route-order tests and `route.emergencyOverLimit.test.ts` must keep passing unchanged.
    - The book route never creates an emergency and never sets `emergencySource`. A booking request carries no Homeowner text, so on an existing emergency it only returns HTTP 409 and writes nothing.
    - Store no Homeowner text in any new attribute. A job that is already an emergency is not written to.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

  - [x] 3.4 Return the reason sentence on every emergency response
    - Extend `toHomeownerStatusView`, `toProEmergencyDetail` and the 409 conflict builders (`conflict.ts`, `proAction.ts`) with `reasonSentence` computed by `emergencyReasonSentence(job.emergencyRule)`.
    - For the book route, the 409 `JOB_IS_EMERGENCY` body only reads the stored rule of the existing emergency to fill `reasonSentence`. It never sets or changes `emergencyRule` or `emergencySource`.
    - Carry the field through the client side: `toEmergencyResult` in `emergencyView.ts`, `viewFromChat`, `applyView` and `applyLive`, and the inspect, reply, chat, book and status responses.
    - A job without a saved rule returns no `reasonSentence`.
    - _Requirements: 18.7, 18.8, 18.10, 18.11_

  - [x] 3.5 Render the sentence on the emergency pages
    - Create `src/components/results/EmergencyReasonLine.tsx`: one fixed plain `<p>` with no `haunted:` class and no theme variant.
    - Render it under the Emergency_Banner in `ResultsView.tsx` (before the Emergency badge) and in the `StatusPanelBody` emergency branch, and under `PRO_EMERGENCY_NOTE` in `ProEmergencyView.tsx`. Render nothing when there is no sentence.
    - _Requirements: 5.1, 10.11, 18.7, 18.8, 18.9, 18.10_

  - [x] 3.6 Update existing tests that fix the changed shapes on purpose
    - Run `vitest --run`, find every existing test that uses an exact-shape assertion on the shapes changed in 3.2 and 3.3, and update each one. Name each updated test file in the task notes.
    - `src/app/api/emergencyIrreversible.property.test.ts` must pass without edits.
    - _Requirements: 18.12_

  - [x] 3.7 Write property test for the rule and source pair
    - **Property 6: Emergency_Rule and Emergency_Source are a total, consistent pair**
    - Cover the three call sites (`precheck`, `postcheck`, `override`) with `fakeDynamoTable.ts`. Non-emergency results write neither field. A booking request on an emergency job writes nothing and sets no source.
    - **Validates: Requirements 18.1, 18.2**

  - [x] 3.8 Write property test that no homeowner text is stored
    - **Property 7: No homeowner text reaches the stored emergency attributes**
    - New file `src/lib/emergency/noTextLeak.property.test.ts`, using the existing trigger-phrase corpus plus random padding.
    - **Validates: Requirements 18.3, 18.13**

  - [x] 3.9 Write property test that the saved rule never changes
    - **Property 8: Once emergency, the saved rule and source never change**
    - New file `src/lib/aws/jobs.emergencyImmutable.property.test.ts`, in the style of `emergencyIrreversible.property.test.ts`.
    - **Validates: Requirements 18.4**

  - [x] 3.10 Write property test for the reason-sentence mapping
    - **Property 9: The reason-sentence mapping is total and exact**
    - New file `src/lib/emergency/reasons.property.test.ts`.
    - **Validates: Requirements 18.7, 18.8, 18.9, 18.10**

  - [x] 3.11 Write unit tests for the emergency reason
    - One test per rule (saved rule, saved source, shown sentence). One test for a job with no saved rule. One test per Emergency_Source. One test that the sentence element has no `haunted:` class. One test that a booking request on an emergency job returns 409 and sets no source.
    - _Requirements: 18.3, 18.13, 18.14, 18.17_

  - [x] 3.12 Update the Normal_Baseline_Test and Contrast_Registry for the sentence
    - Update `normalBaseline.test.ts` for `EmergencyReasonLine.tsx` and the changed emergency components, listing each class in the top comment.
    - Add a Contrast_Registry row for the Emergency_Reason_Sentence on its background.
    - _Requirements: 1.9, 14.1, 15.2_

  - [x] 3.13 Write property test that the Emergency_Rule_Wrapper agrees with replyTriggersEmergency
    - **Property 10: The Emergency_Rule_Wrapper agrees with replyTriggersEmergency**
    - New file `src/lib/emergency/ruleWrapper.property.test.ts`. For any text, `emergencyRuleFor(text).isEmergency` equals `replyTriggersEmergency(text)`. When true, `rule` is one of the four Emergency_Rule codes. When false, `rule` is `undefined`. Generate `fc.string()` and trigger phrases from the existing corpus embedded in random padding. Import `replyCheck.ts` as it is.
    - **Validates: Requirements 18.4, 18.5**

  - [x] 3.14 Verify task 3
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. `src/lib/safety/`, `EMERGENCY_MESSAGE` and `sourceScan.test.ts` must be unchanged and passing.
    - _Requirements: 14.5, 14.6, 15.12_

- [ ] 4. Home page, with the Step 2 dropdowns and the desktop columns
  - [ ] 4.1 Create the Layout_Definition module
    - Create `src/lib/layout/sections.ts` with the `SectionId` unions and the constants `HOME_LAYOUT`, `RESULTS_LAYOUT` and `PRO_JOB_LAYOUT`, each `{ phone, desktop: { left, right } }`. Use the section order of Requirements 3, 4.1, 10.3, 10.4 and 17.7. Pages read their section order from these constants. `RESULTS_LAYOUT.phone` is: back-link, urgency-meter, issue-title, likely-diagnosis-line, who-to-call, likely-cost, job-brief, questions, safe-things, chat, job-tracker, booking, notice-copy-link, help. `RESULTS_LAYOUT.desktop.left` is urgency-meter through chat, and `desktop.right` is job-tracker, booking, notice-copy-link. With back-link first and help last, back-link + left + right + help equals `phone`, so the DOM order is the same in both layouts (left column, then right column).
    - _Requirements: 4.1, 10.3, 10.4, 17.7, 17.12_

  - [ ] 4.2 Replace the Location and Duration chips with dropdowns
    - Create `src/components/intake/SelectField.tsx` (label, native `<select>`, error text, `aria-invalid`, `aria-describedby`, at least 44 px high), modelled on `FreeTextField.tsx`.
    - In `StepTwo.tsx`, replace the two chip groups with the Location_Select (first option "Choose a room") and the Duration_Select (first option "Choose how long (optional)"). Use `LOCATION_OPTIONS` and `DURATION_OPTIONS` in the same order. Dispatch the same `setLocation` and `setDuration` actions. Keep the Safety_Group, Extras_Group and both text boxes.
    - Mark "Exactly where?" required when the location is "Other". On Next with no room, stay on Step 2, show the error, set `aria-invalid`, link it with `aria-describedby` and move focus to the select. Clear the error when a room is chosen.
    - The Sample_Button sets both selects. Do not change `intakeReducer.ts`, `answerMapper.ts` or `stepValidation.ts`.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 16.11_

  - [ ] 4.3 Update the guided-intake spec documents
    - In `.kiro/specs/guided-intake/requirements.md`, `design.md` and `tasks.md`, describe the two dropdowns in place of the two chip groups. Change the Location_Group and Duration_Group definitions, Requirement 5 criteria 2 to 6, Requirement 6 criteria 2, 9 and 10, Requirement 9 criterion 4 and Requirement 13 criterion 6.
    - Run `validate_spec_format` on each changed document and fix any error.
    - _Requirements: 16.12_

  - [ ] 4.4 Replace the guided-intake chip-group tests with dropdown tests
    - Find the existing tests that cover the Location_Group and Duration_Group (keyboard behaviour, accessible names, chip selection) and replace each with a test of the matching dropdown. Name every replaced test file in the task notes.
    - Do not change the existing `answerMapper` tests. They must pass unchanged.
    - _Requirements: 16.8, 16.13_

  - [ ] 4.5 Apply the home mockup look to Steps 1 and 3
    - Add the `h1` "Upload a photo or video of your problem." and the line below it.
    - Add the "Your photos" card: count "<n> of 5 photos" or "1 video", one row per file with a 56 px thumbnail (video icon), file name, size in MB with one decimal, a 44 px "Remove" button, the dashed drop area with "Drag more photos here, or" and "Add more photos", the "JPEG, PNG or WebP, up to 10 MB each" text and "Clear selection". Keep the empty drop area and Sample_Button when no file is selected. Remove and Clear selection keep every answer and Safety_Chip choice.
    - Step 3: the "Before you send" card (lock icon, `#EEF4FB` background, `#C9DAEE` border) with the existing `DataRetentionNotice` text, and a full-width 54 px "Inspect my home" button with 12 px corners.
    - Keep every other guided-intake behaviour. No horizontal scroll from 320 px to 1920 px.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_

  - [ ] 4.6 Add the desktop columns, Inspection_Panel and Live_Summary
    - At 1024 px and wider, show the current Step on the left and the Inspection_Panel ("Your inspection") on the right as a Sticky_Panel, using `HOME_LAYOUT`. Below 1024 px show one column and no panel.
    - Create the Step_List (finished steps are buttons that return to that step and keep the Intake_State, the current step shows "Current step", later steps are not clickable) and the Live_Summary, which reuses the Step 3 review text function so both read the same text. The Live_Summary updates in the same render.
    - Centre content in a 42 rem column for single-column steps and 1120 px for two columns. The Inspection_Panel uses `STICKY_PANEL` (the `tall` screen), so it is sticky only when the window is tall enough to show the whole panel. In a shorter window it scrolls with the page, is shown whole, and has no inner scroll box. Tab order follows reading order.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.9, 17.10, 17.12, 17.13_

  - [ ] 4.7 Update the Normal_Baseline_Test for the home page
    - Update `normalBaseline.test.ts` for the changed intake components. List each changed class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [ ] 4.8 Add home page rows to the Contrast_Registry
    - Add rows for the "Before you send" notice, the photo rows, the dropdowns, the Step_List states and the Live_Summary, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 4.9 Write property test for Live_Summary and Review_Text
    - **Property 4: Live_Summary text equals the Step 3 Review_Text for the same state**
    - New file `src/components/intake/liveSummary.property.test.ts`, using the existing `IntakeChoices` arbitrary.
    - **Validates: Requirements 17.4, 17.5**

  - [ ]* 4.10 Write property test for dropdown and chip answer equality
    - **Property 5: Dropdown answer strings equal chip answer strings**
    - Compare `mapAnswers` output for all reachable `IntakeChoices` with the pre-feature expected strings. Leave the existing `answerMapper` tests unchanged.
    - **Validates: Requirements 16.8**

  - [ ]* 4.11 Write unit tests for the home page
    - Photo card count for 0, 1 and 5 photos and for a video. Remove and Clear selection keep the answers. Step 3 notice text. Step_List behaviour. Section order of `HOME_LAYOUT` for phone and desktop matches the rendered order, and left then right equals the phone order.
    - _Requirements: 3.3, 3.4, 3.9, 15.7, 15.9, 17.3_

  - [ ] 4.12 Verify task 4
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Check that `answerMapper` tests and `sourceScan.test.ts` pass unchanged.
    - _Requirements: 15.12_

- [ ] 5. Result page, with the desktop columns
  - [ ] 5.1 Rebuild the result sections in the mockup order
    - In `ResultsView.tsx` (`NormalResult`), render in this order: "Start a new inspection" link with a back arrow, issue `h1`, "This is a likely diagnosis, not a certain one.", the "Who to call" and "AI confidence in this diagnosis" card (two values side by side at 390 px, confidence bar filled to the percentage, "~<n>%"), the "Likely cost" card (28 px, weight 700, existing `CostRange` format, "rough range, not a quote" below), job brief with the 44 px "Copy job brief" button, questions, safe things, the Chat_Panel, the Job_Tracker, the booking section, the Results_Page_Notice with the Copy_Link_Button, and the Help_Section last. Order is read from `RESULTS_LAYOUT.phone`. The tracker, booking and notice are mounted by tasks 5.3 and 6.2 to 6.3 in their slots of this order.
    - Keep all safety text and no do-it-yourself steps for gas or electrical work.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.10, 4.11, 4.12_

  - [ ] 5.2 Add the Urgency_Meter
    - Create `src/lib/jobs/urgencyMeter.ts` (`URGENCY_METER_STEPS`, `currentMeterIndex`) and `src/components/results/UrgencyMeter.tsx`: four steps, the Urgency_Badge on the current one, `aria-current="step"`, a visible mark and the text label on every step.
    - Mount it in `NormalResult` above the title, never in the emergency branch. In the Haunted theme keep the plain wording and badge colours.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 5.3 Add the Copy_Link_Button and notice
    - Create `src/components/results/CopyLinkButton.tsx`: 44 px high, accessible name "Copy link to this page", copies the current page address, shows "Link copied" in an `aria-live="polite"` element for at least 2 seconds, and on failure shows the Copy_Fallback_Box with the address selected (reuse the pattern in `JobBrief.tsx`).
    - Place it beside the Results_Page_Notice with the exact text from `chat-and-help`. Keep "Start a new inspection" above the Help_Section as before. Render none of this on an Emergency_Page.
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ] 5.4 Make the emergency page a plain single column
    - In the emergency branch, render inside `main` only: Emergency_Banner, the reason sentence, the Emergency badge, the `h1` "Possible emergency" and "Start a new inspection" (which goes to the Home_Page). Keep the banner style (`#B42318`, white text, 16 px corners, 19 px semi-bold, alert role, warning icon, no `haunted:` class). No side panel at any width. Always Normal theme.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 17.11_

  - [ ] 5.5 Add the result desktop columns
    - At 1024 px and wider, use `RESULTS_LAYOUT`: the left column holds the meter, title, "Who to call", cost, job brief, questions, safe things and the Chat_Panel. The right column holds the Job_Tracker, the booking section and the notice with the Copy_Link_Button, as a Sticky_Panel using `STICKY_PANEL` (sticky only in the `tall` screen, otherwise it scrolls with the page, is shown whole and has no inner scroll box). The DOM lists the left column, then the right column, then the Help_Section, which is the phone order. Use no CSS reordering. "Start a new inspection" sits above both columns and the Help_Section runs full width below. Use a 1120 px centred column. No horizontal scroll from 1024 px to 1920 px.
    - _Requirements: 17.7, 17.8, 17.9, 17.10, 17.12, 17.13_

  - [ ] 5.6 Update the Normal_Baseline_Test for the result page
    - Update `normalBaseline.test.ts` for the changed result components, listing each class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [ ] 5.7 Add result page rows to the Contrast_Registry
    - Add rows for the Urgency_Meter steps, the confidence bar, the cost card, the Copy_Link_Button and "Link copied" text, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 5.8 Write property test for the Urgency_Meter
    - **Property 2: Urgency_Meter marks exactly one current step matching the label**
    - New file `src/lib/jobs/urgencyMeter.property.test.ts`.
    - **Validates: Requirements 7.3, 7.7**

  - [ ] 5.9 Write unit tests for the result page
    - Section order from `RESULTS_LAYOUT` (phone order ends: safe things, chat, tracker, booking, notice with copy link, help; back-link + left + right + help equals phone; the rendered DOM follows it). The four meter labels and the visible label. Copy_Link_Button copied text, "Link copied" for at least 2 seconds with fake timers, fallback box on rejection. No copy button, notice, tracker, meter, chat or help section on an Emergency_Page. Emergency page content and order.
    - _Requirements: 4.5, 4.6, 4.9, 5.1, 5.2, 15.4, 15.6, 15.9_

  - [ ] 5.10 Verify task 5
    - Run `next lint`, `tsc --noEmit` and `vitest --run`.
    - _Requirements: 15.12_

- [ ] 6. Booking and tracker
  - [ ] 6.1 Add the tracker view mapper
    - Create `src/lib/jobs/trackerView.ts` with `TRACKER_STEPS`, the `TrackerView` type and the pure `trackerViewFromStatus(status, declineReason?)`. Map `new` and `info_requested` to "Tradesperson reviewing", `accepted` to "Pick a time", `booked` to "Booked" and `declined` to the end state.
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.11_

  - [ ] 6.2 Add the Job_Tracker to the result page
    - Create `src/components/results/JobTracker.tsx`: the four steps with a visible mark and "Current step" text, the end state for `declined` (text "This tradesperson can't take your job right now", the reason if any, the Status_Safety_Line), the `role="status"` text from `HOMEOWNER_STATUS_TEXT`, "Updates every 30 seconds." and a 44 px Refresh button. It uses the polling object that `StatusPanelBody` already uses, so the interval, single request, tab-hidden pause and terminal stop do not change.
    - Mount it from `NormalResult` only, so no tracker and no status request appear on an Emergency_Page. Place it in the right column on desktop.
    - _Requirements: 6.1, 6.2, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ] 6.3 Restyle the booking section
    - Show, while `accepted`, the heading "A tradesperson can take your job. Pick a time that suits you." and the legend "Offered start times". Show each slot, in ascending order, as a Booking_Card radio of at least 60 px with the day, the time and zone name, and a `<time dateTime>` in UTC. Selected cards get a 2 px accent border and a visible mark. "Confirm this time" is disabled until one is selected and uses the existing booking route and emergency override handling.
    - While `booked`, show "Your booking is confirmed. The tradesperson will arrive <day and time>." with a `<time>` element and the Status_Safety_Line. Show no cards for `new`, `info_requested`, `declined` or `emergency`.
    - Place the booking section after the Job_Tracker, which follows the Chat_Panel, with the notice and Copy_Link_Button, then the Help_Section, after it.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10_

  - [ ] 6.4 Update the Normal_Baseline_Test for the tracker and booking
    - Update `normalBaseline.test.ts` for `JobTracker.tsx` and the booking components, listing each class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [ ] 6.5 Add tracker and booking rows to the Contrast_Registry
    - Add rows for the tracker done, current and upcoming states, the end state, the Booking_Card border and selected state, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 6.6 Write property test for the tracker mapping
    - **Property 1: Job_Tracker maps every non-emergency status to exactly one view**
    - New file `src/lib/jobs/trackerView.property.test.ts`.
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.11**

  - [ ]* 6.7 Write unit tests for the tracker and booking
    - Current step for each status, the end state for `declined`, status text, "Updates every 30 seconds.", Refresh, no tracker or status request on an Emergency_Page. Booking card structure, selection mark, disabled and enabled Confirm button, booked text, no booking UI for the other statuses.
    - _Requirements: 6.2, 6.7, 6.10, 8.2, 8.3, 8.4, 8.6, 8.9, 15.3_

  - [ ] 6.8 Verify task 6
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Existing polling tests must pass unchanged.
    - _Requirements: 6.8, 15.12_

- [ ] 7. Pro job list
  - [ ] 7.1 Add the Filter_Chip count function
    - Create a pure function (for example `src/components/pro/filterChips.ts`) that returns the chips All, New, Waiting for reply, Accepted, Booked and Emergency with counts over the loaded jobs, and a predicate per chip. Declined jobs show only under All.
    - _Requirements: 9.3, 9.4_

  - [ ] 7.2 Restyle the Pro job list
    - In `ProDashboard.tsx`, show `h1` "Jobs", "The newest 50 jobs from the last 30 days." and a 44 px Refresh button. Add the chips with counts (for example "New (3)"), `aria-pressed`, a visible mark and 44 px height. All is selected first. Filtering uses loaded data with no new request. Show "No jobs match this filter." when empty. Refresh keeps the selected chip and updates counts.
    - At 1024 px and wider show a table in a 14 px rounded white card with columns Urgency, Where in the home, Trade, Received and Status and a `#EEF1F5` header. Each row has the badge, a link to `/pro/jobs/[id]` whose name includes location and status, the trade, `<time>` in the browser zone and the status text. Below 1024 px show cards with the same facts and links and no horizontal scroll.
    - Emergency rows show "—" for the trade, the `#FEF3F2` background and no action. Show "Emergency jobs show no trade and no actions. The homeowner was told to call 911." below the list. Keep the loading, empty and error behaviour.
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13_

  - [ ] 7.3 Update the Normal_Baseline_Test for the Pro list
    - Update `normalBaseline.test.ts` for the changed Pro list components, listing each class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [ ] 7.4 Add Pro list rows to the Contrast_Registry
    - Add rows for the Filter_Chip selected and unselected states, the table header, the emergency row and the status text, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 7.5 Write property test for the Filter_Chip counts
    - **Property 3: Filter_Chip counts always match their filtered result**
    - New file `src/components/pro/filterChipCounts.property.test.ts`, using the existing job fixtures.
    - **Validates: Requirements 9.4, 9.14**

  - [ ]* 7.6 Write unit tests for the Pro list
    - Pressed state, filtered rows, empty-filter text, kept selection after Refresh, emergency row, note text, and table and card parity.
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.11, 9.13, 15.5_

  - [ ] 7.7 Verify task 7
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Existing `pro-dashboard-and-booking` list tests must pass.
    - _Requirements: 9.2, 15.12_

- [ ] 8. Pro job page
  - [ ] 8.1 Rebuild the top and section order of the Pro job page
    - In `JobDetail.tsx`, show the "All jobs" link with a back arrow, the Urgency_Badge and Status_Pill ("Status: <label>"), the issue `h1` and "Received <time>" in a `<time>` element. Order the sections from `PRO_JOB_LAYOUT.phone`: job brief with "Questions you may want to ask", Photos (<n>), Homeowner's answers, Chat_Panel, Trade, Likely cost and AI confidence, Respond_Panel, Help_Section. Keep the load, 404, 500 and "Try again" behaviour.
    - _Requirements: 8.8, 10.1, 10.2, 10.3, 10.6, 10.13_

  - [ ] 8.2 Restyle the Photos section
    - Show "Photos (<n>)", a thumbnail grid that opens the existing `PhotoViewer`, and "Photo links expire after 15 minutes. Refresh the page to see them again."
    - _Requirements: 10.5_

  - [ ] 8.3 Restyle the Respond_Panel
    - Heading "Respond to this job". For `new` and `info_requested` show the decline control first and the accept control last, with the legend "Accept and offer times", labels "First time you can start", "Second time" and "Third time", and the button "Accept and offer these times". Keep the decline reason field (200 characters, live count), "Decline job" and the existing validation. Remove the "Ask the homeowner a question" form. For `accepted`, `booked` and `declined` show the existing slots, booked slot or reason.
    - _Requirements: 10.7, 10.8, 10.9, 10.10_

  - [ ] 8.4 Add the desktop columns and the emergency view
    - At 1024 px and wider, use `PRO_JOB_LAYOUT`: the left column holds job brief, photos, answers and chat, and the right column holds trade, cost, confidence and the Respond_Panel as a Sticky_Panel using `STICKY_PANEL` (sticky only in the `tall` screen, otherwise normal scrolling, whole panel shown, no inner scroll box). Left column first, then right column in the DOM, with no CSS reordering. Centre content in a 1120 px column.
    - For an emergency job show the Pro_Emergency_Note, the reason sentence under it, the issue and the answers as read-only text, with no chat, respond panel, photos, cost, trade, help section or sticky panel.
    - _Requirements: 10.4, 10.11, 10.12, 17.9, 17.10_

  - [ ] 8.5 Update the Normal_Baseline_Test for the Pro job page
    - Update `normalBaseline.test.ts` for the changed Pro job components, listing each class per file in the top comment.
    - _Requirements: 1.9, 15.2_

  - [ ] 8.6 Add Pro job page rows to the Contrast_Registry
    - Add rows for the Status_Pill, the respond panel controls, the photo caption and the sticky panel card, in both themes.
    - _Requirements: 14.1, 14.2_

  - [ ]* 8.7 Write unit tests for the Pro job page
    - Top section and Status_Pill text, section order from `PRO_JOB_LAYOUT` for phone and desktop, photos text, respond panel control order, no ask form, and the emergency view content.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.9, 10.11, 15.9_

  - [ ] 8.8 Verify task 8
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. Existing Pro action and chat tests must pass.
    - _Requirements: 15.12_

- [ ] 9. Haunted check
  - [ ] 9.1 Finish the Haunted look on every screen
    - Header band with moon, house and trees, 170 px on the Home_Page and 112 px elsewhere on the phone, `aria-hidden`, not covering the title or switch. Cobweb on cards, the Ghost_Icon with "No spirits caught yet." in the empty photo box, the Ghost_Trade_Label (with the real trade) above the result title, and the Fog_Layer with no pointer events.
    - Keep urgency, cost, status, error and safety text plain. Show none of the art or Haunted wording on an Emergency_Page. Haunted keeps the same section order, columns and text as Normal.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [ ] 9.2 Audit hover, pressed and motion rules
    - Make sure every button, link, chip, Booking_Card and Filter_Chip has `hover:` and `active:` classes from the tokens. Move any motion rule into `src/app/haunted-motion.css` under `.theme-haunted`, and make sure no component file has an `animate-`, `transition` or `duration-` class. With `prefers-reduced-motion: reduce`, show no animation, transition or smooth scroll. Add no artificial delay anywhere.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ] 9.3 Add the remaining Haunted rows to the Contrast_Registry
    - Add Haunted-theme rows for the header band over the title and switch, the ghost tag, the cobweb corner text and the fog layer over text, so every new pair from tasks 1 to 8 is listed in both themes.
    - _Requirements: 11.2, 14.1, 14.2_

  - [ ] 9.4 Write theme parity and Haunted tests
    - The Haunted theme has the same section order and text as Normal on the Home_Page, Results_Page and Pro_Job_Page. Header art heights and `aria-hidden`, ghost label contains the real trade, no art on an Emergency_Page.
    - _Requirements: 11.1, 11.2, 11.5, 11.8, 11.9, 15.10, 15.11_

  - [ ] 9.5 Verify task 9
    - Run `next lint`, `tsc --noEmit` and `vitest --run`. `sourceScan.test.ts` must pass unchanged.
    - _Requirements: 14.6, 15.12_

- [ ] 10. Final checkpoint
  - Run `next lint`, `tsc --noEmit` and `vitest --run`. Check that `src/lib/safety/`, `EMERGENCY_MESSAGE` and `sourceScan.test.ts` are unchanged, and that `emergencyIrreversible.property.test.ts`, `route.emergencyOverLimit.test.ts`, the route-order tests and the `answerMapper` tests pass without edits.
  - Use the Playwright MCP server on localhost to check the Home_Page and the `/pro` access code screen at 390 px and 1280 px, in the Normal and Haunted themes. Also check the Sticky_Panel rule on the Home_Page in a window shorter than the panel: the panel scrolls with the page, is shown whole and has no inner scroll box. Record the result in `BUILD_LOG.md`.
  - List in `BUILD_LOG.md` that the owner checks the Results_Page, the booking section and the Pro_Job_Page by hand on the live site, because they need a real job and the Pro access code. Do not ask the user whether to use Playwright.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 14.5, 14.6, 15.1, 15.12, 15.13, 15.14, 17.9, 18.6, 18.16_

## Notes

- Tasks marked with `*` are optional new tests and can be skipped for a faster MVP.
- Updates to existing tests (baseline, contrast registry, guided-intake chip-group tests, changed response shapes) are required because the suite fails without them.
- The safety and emergency-page tests (3.7 to 3.11, 3.13, 5.9 and 9.4) are required, not optional.
- Each task references requirements for traceability. Property tests map to Properties 1 to 10 in the design.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["2.2"] },
    { "id": 6, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 7, "tasks": ["2.6"] },
    { "id": 8, "tasks": ["3.1", "3.2"] },
    { "id": 9, "tasks": ["3.3"] },
    { "id": 10, "tasks": ["3.4"] },
    { "id": 11, "tasks": ["3.5"] },
    { "id": 12, "tasks": ["3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13"] },
    { "id": 13, "tasks": ["3.14"] },
    { "id": 14, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 15, "tasks": ["4.4", "4.5"] },
    { "id": 16, "tasks": ["4.6"] },
    { "id": 17, "tasks": ["4.7", "4.8", "4.9", "4.10", "4.11"] },
    { "id": 18, "tasks": ["4.12"] },
    { "id": 19, "tasks": ["5.1"] },
    { "id": 20, "tasks": ["5.2"] },
    { "id": 21, "tasks": ["5.3"] },
    { "id": 22, "tasks": ["5.4"] },
    { "id": 23, "tasks": ["5.5"] },
    { "id": 24, "tasks": ["5.6", "5.7", "5.8", "5.9"] },
    { "id": 25, "tasks": ["5.10"] },
    { "id": 26, "tasks": ["6.1"] },
    { "id": 27, "tasks": ["6.2"] },
    { "id": 28, "tasks": ["6.3"] },
    { "id": 29, "tasks": ["6.4", "6.5", "6.6", "6.7"] },
    { "id": 30, "tasks": ["6.8"] },
    { "id": 31, "tasks": ["7.1"] },
    { "id": 32, "tasks": ["7.2"] },
    { "id": 33, "tasks": ["7.3", "7.4", "7.5", "7.6"] },
    { "id": 34, "tasks": ["7.7"] },
    { "id": 35, "tasks": ["8.1"] },
    { "id": 36, "tasks": ["8.2"] },
    { "id": 37, "tasks": ["8.3"] },
    { "id": 38, "tasks": ["8.4"] },
    { "id": 39, "tasks": ["8.5", "8.6", "8.7"] },
    { "id": 40, "tasks": ["8.8"] },
    { "id": 41, "tasks": ["9.1"] },
    { "id": 42, "tasks": ["9.2"] },
    { "id": 43, "tasks": ["9.3", "9.4"] },
    { "id": 44, "tasks": ["9.5"] },
    { "id": 45, "tasks": ["10"] }
  ]
}
```
