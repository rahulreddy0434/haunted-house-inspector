# Implementation Plan: Haunted Mode

## Overview

The plan builds Haunted mode in eight parent tasks, in the order that puts safety first: emergency rules, tokens and contrast data, palette swap and the switch, ghost names and wording, font, art, motion, then a final checkpoint. The language is TypeScript (the design uses TypeScript).

Each parent task leaves the app working. After any parent task, `next lint`, `tsc --noEmit` and `vitest run` pass, and the Normal theme is unchanged except the form-field border (`gray-400` to `gray-500`, Req 3.5), which lands in task 3. Parts of the design that depend on later tasks are noted inside the task that creates them (for example, card heading font rules do nothing until `data-card` exists in task 6).

Fixed constraints for every task:
- Do not edit `src/lib/jobs/copy.ts`, `src/lib/emergency/messages.ts` text, or anything in `src/lib/safety/` (Req 16.1).
- Add no npm package and change no `dependencies` or `devDependencies` entry (Req 16.2). Use `tailwindcss/resolveConfig`, `next/font/local` and `fast-check`, which are already installed.
- Do not edit `src/components/sourceScan.test.ts`, except that the file list MAY be extended for a new component (Req 16.3, 16.4). New shared components go under `src/components/ui/` so the existing recursive scan covers them.
- Normal-theme classes keep their computed values.

## Tasks

- [x] 1. Emergency rules first
  - [x] 1.1 Add the effective-theme derivation and `ThemeProvider`
    - Create `src/lib/haunted/effectiveTheme.ts` with `deriveEffectiveTheme(setting, scopes)`.
    - Create `src/components/ThemeProvider.tsx` (client): state `setting` (starts `normal`), `scopes` (starts 0), `ready` (starts false); a layout effect that reads `readStoredTheme()` and sets `ready`; a layout effect that calls the existing `applyTheme(effective)` only when `ready`; `setSetting` that stores via `storeTheme` and is a no-op while `scopes > 0`; `registerEmergencyScope()` counter that never goes below 0.
    - Export `useTheme()`, which returns a Normal, no-op context outside a provider so existing component tests keep passing.
    - Wrap the app in the provider in `src/app/layout.tsx`. Keep the inline head script and `src/lib/theme.ts` unchanged.
    - _Requirements: 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 12.4, 12.6, 13.3, 13.5_

  - [x] 1.2 Add `EmergencyScope` and mount it in the three emergency branches
    - Create `src/components/ui/haunted/EmergencyScope.tsx`. It calls `registerEmergencyScope()` inside `useLayoutEffect` (not `useEffect`) and renders `null`.
    - Mount it in the `ResultsView` emergency branch (`urgency === 'emergency' || isEmergency`), in `StatusPanel` (return `<EmergencyScope />` instead of `null` when `view.status === 'emergency'`), and in the `JobDetail` emergency branch (`job.status === 'emergency'`).
    - The Pro job list stays outside any scope. Emergency rows in the list keep the badge and show no ghost label.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 1.3 Hide the switch on an Emergency_Page
    - Change `src/components/ThemeToggle.tsx` to read `inEmergency`, `setting` and `setSetting` from `useTheme()` and return `null` while `inEmergency` is true (absent from the DOM, no replacement text, not disabled).
    - Keep its current markup and labels for now; the `role="switch"` conversion is in task 3.
    - _Requirements: 1.1, 12.5, 13.3_

  - [x] 1.4 Give the Fixed_Emergency_Elements one fixed style
    - In `src/components/results/EmergencyBanner.tsx`, delete every `haunted:` class and keep one fixed high-contrast style, `role="alert"` and `aria-live="assertive"`. Text stays exactly `EMERGENCY_MESSAGE`, in the body font, with no animation or transition.
    - In `src/components/results/UrgencyBadge.tsx`, delete the four `haunted:` classes of the emergency level. Urgent, soon and monitor keep their current `haunted:` classes for now.
    - In `src/components/ui/styles.ts`, add `NOTE_BOX` (`rounded-lg border border-slate-300 bg-slate-50 p-4 text-slate-900`, no `haunted:` class) and use it for `PRO_EMERGENCY_NOTE` in `ProEmergencyView` instead of `STATUS_BOX`.
    - _Requirements: 8.10, 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 11.8, 11.10, 12.9, 13.1, 13.2_

  - [x] 1.5 Write example tests for the emergency rules
    - Banner, emergency badge and Pro note (`ProEmergencyView`), each rendered with `theme-haunted` on `document.documentElement`: same fixed classes as without it, no class token starting with `haunted:`, no `[data-haunted-art]` inside.
    - Banner keeps `role="alert"` and `aria-live="assertive"` after a theme toggle.
    - Update `UrgencyBadge.test.tsx`: urgent, soon and monitor still carry `haunted:` variants; emergency carries none.
    - Update `ThemeToggle.test.tsx` to render inside `ThemeProvider`: the switch is absent while an `EmergencyScope` is mounted and present again after it unmounts.
    - Source test: `EmergencyScope.tsx` imports and calls `useLayoutEffect` and does not use `useEffect`.
    - Render test: with `hhi_theme = haunted`, rendering an emergency view leaves the root without `theme-haunted` with no timers or awaits (Results_Page, reply returning `JOB_IS_EMERGENCY`, status poll returning `emergency`, Pro job page).
    - Leave-emergency test: with `hhi_theme = haunted`, render an emergency Results_Page, click "Start a new inspection" (or unmount it), then assert `theme-haunted` is back on the root, `hhi_theme` is still `haunted`, and the switch is shown on.
    - Exact-string test for `EMERGENCY_MESSAGE` and `PRO_EMERGENCY_NOTE`.
    - _Requirements: 11.1, 11.2, 11.6, 11.10, 12.1, 12.2, 12.5, 12.6, 13.1, 13.2, 13.5, 16.5, 17.7, 17.9, 17.12, 17.13_

  - [x] 1.6 Write property tests for the effective theme and emergency pages
    - **Property 5: Effective theme follows the model** (`src/components/ThemeProvider.property.test.tsx`; random operation sequences against a pure model; at least 100 runs)
    - **Validates: Requirements 12.4, 12.5, 12.6, 13.3, 13.5, 17.13**
    - **Property 6: Emergency pages never render Haunted styling** (`src/components/results/emergencyHaunted.property.test.tsx`; scenarios: direct load, reply 409, booking 409, poll `emergency`, Pro job page; stored setting `normal` or `haunted`; at least 100 runs; for this task assert the root class, no switch, no `[data-ghost]` or `[data-haunted-art]`, no `haunted:` token on the three fixed elements, exact message text, `hhi_theme` unchanged)
    - **Validates: Requirements 6.13, 11.1, 11.2, 11.8, 11.9, 12.1, 12.2, 12.8, 13.1, 13.2, 14.7, 17.3**

  - [ ]* 1.7 Write property tests for theme storage
    - **Property 9: Theme setting round trip** (`src/lib/theme.property.test.ts`; keep `theme.test.ts` as it is)
    - **Validates: Requirements 2.2, 2.6, 2.7, 17.5**
    - **Property 10: Only the exact value `haunted` turns the theme on** (also checks the inline head script condition)
    - **Validates: Requirements 2.1, 2.3, 2.4**

- [x] 2. Palette tokens and contrast data
  - [x] 2.1 Define the Haunted tokens in `tailwind.config.ts`
    - Set `colors.haunted` to the design values: `bg #0d0814`, `surface #2b1a48`, `field #1a0f2e`, `border #8a63c9`, `text #f1e9fb`, `muted #cdbbe8`, `accent #ff9d2e`, `accent-hover #ffb454`, `on-accent #1a1008`, `error #ffb3a7`, `ok #9fe3b0`, `soon #f2cf5b`, `fog #6a45a8`.
    - Keep the existing `glow` token, shadows, `animation` and `keyframes` for now; later tasks remove them once nothing uses them.
    - These hex values live only in this file.
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 Read the palette from CSS variables
    - In `src/app/globals.css`, define `--foreground` and `--background` under `.theme-haunted` with `theme('colors.haunted.text')` and `theme('colors.haunted.bg')`, and set `color-scheme: dark`.
    - Delete the old literal `#e9d5ff` and `#0f0a1a`. Leave the Normal `:root` values and the existing reduced-motion rule unchanged.
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.3 Add the contrast library and the Contrast_Registry
    - Create `src/lib/haunted/contrast.ts` (`relativeLuminance`, `contrastRatio`, `blend`, `minimumFor`; WCAG 2.x formula).
    - Create `src/lib/haunted/palette.ts` (`resolveColour(ref)` using `tailwindcss/resolveConfig` on `tailwind.config.ts`; imported only by tests).
    - Create `src/lib/haunted/contrastRegistry.ts` with typed `CONTRAST_REGISTRY` rows H-01 to H-36, F-01 to F-05 (once with `theme: 'normal'` and once with `theme: 'haunted'`) and N-01 to N-32, using token names, plus `checkRegistry()`. Failure message format: `"<id> [<theme>/<role>] <usage>: ratio <x.xx> is below the minimum <m>"`.
    - _Requirements: 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.8, 11.5_

  - [x] 2.4 Write property tests for contrast
    - **Property 7: Every registered colour pair meets its minimum** (`src/lib/haunted/contrastRegistry.property.test.ts`; `fc.constantFrom(...CONTRAST_REGISTRY)`; at least 100 runs; also asserts the banner and badge pairs are present for both themes)
    - **Validates: Requirements 3.7, 4.1, 4.3, 4.4, 4.5, 4.8, 9.8, 11.5, 17.4**
    - **Property 8: Contrast ratio is a well-formed measure** (symmetric, 1 to 21, equal colours give 1)
    - **Validates: Requirements 4.3, 4.4, 4.7**

  - [ ]* 2.5 Write example tests for the registry
    - A deliberately failing pair produces the message with id, theme, role, ratio and minimum.
    - Design-table ratios (for example H-01 16.75, H-23 5.25, F-04 3.95) match the computed values to two decimals.
    - _Requirements: 4.6, 4.7_

- [x] 3. Palette swap, field border and the Haunted_Switch
  - [x] 3.1 Capture the Normal-theme baseline
    - Write a test that snapshots the non-`haunted:` colour classes of every recipe in `src/components/ui/styles.ts` and of the components changed in 3.3, taken before any edit in this task. The only listed difference allowed later is the field border `gray-400` to `gray-500`.
    - _Requirements: 3.5, 16.8_

  - [x] 3.2 Move the shared recipes to tokens
    - In `src/components/ui/styles.ts`, replace every `haunted:` colour in `CARD`, `HEADING`, `BODY`, `MUTED`, `FIELD`, `PRIMARY_BUTTON`, `SECONDARY_BUTTON`, `ERROR_TEXT` and `STATUS_BOX` with the `haunted-*` token classes from the design table.
    - Change the Normal field border `gray-400` to `gray-500` in `FIELD`.
    - Add `PAGE_TITLE` (`text-2xl font-bold text-slate-900 haunted:text-haunted-accent`) and `haunted:` focus ring colours and ring offsets from tokens.
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 16.8_

  - [x] 3.3 Replace raw palette classes on every in-scope page
    - Home page: `DataRetentionNotice`, `UploadFlow`, `DropZone` (replace `haunted:bg-haunted-glow haunted:text-white` with the primary-button Haunted classes), `UploadProgress` (bars use `haunted-accent`, `haunted-ok`, `haunted-error`).
    - Results page: `ResultsView` (`TEXT`, `LINK`), `IssueSummary`, `CostRange`, `JobBrief`, `StatusPanel` and its reply box, `ContextForm` and `SlotPicker` (`haunted:accent-haunted-accent`).
    - Pro pages: `AccessCodeForm`, `JobListItem`, `PhotoGallery`, `JobFacts`, `JobHistory`, `ActionPanel` and its accept, decline and ask forms.
    - Use the shared recipes or the same tokens. Do not touch wording, and do not touch `transition-*` classes yet.
    - Update `UrgencyBadge` urgent, soon and monitor levels to `haunted-*` tokens. Emergency stays fixed.
    - _Requirements: 3.3, 3.4, 3.6, 8.7, 8.9, 14.1, 14.2, 14.3, 14.4, 16.8_

  - [x] 3.4 Convert the toggle to a `role="switch"`
    - In `src/components/ThemeToggle.tsx`: `<button type="button" role="switch" aria-checked={setting === 'haunted'}>`, visible text "Haunted mode" (accessible name exactly that), an `aria-hidden` "On" or "Off" span, a track and thumb that move left or right, `min-h-11 min-w-11`, `focus-visible:ring-2` with Normal and Haunted ring colours, and no `aria-pressed` or `aria-label`. Off by default.
    - Make the header container in `layout.tsx` `flex flex-wrap` so it fits 320 px.
    - Keep focus on the switch after a toggle. Keep the `return null` from task 1.3 on emergency pages.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 15.1, 15.7_

  - [x] 3.5 Remove the unused glow token and shadows
    - After 3.3, delete the `glow` colour, `haunted-glow` and `haunted-card` box shadows (with the `rgba()` values) from `tailwind.config.ts`. Confirm with a search that no file uses them.
    - _Requirements: 3.2, 10.4_

  - [ ]* 3.6 Write source-scan and protected-text tests
    - Create `src/components/hauntedSourceScan.test.ts`: no raw palette colour (`slate-`, `purple-`, `red-`, `gray-`, and so on) inside any `haunted:` token in `src/**/*.tsx`; no hex, `rgb()` or `hsl()` in Haunted contexts outside `tailwind.config.ts`.
    - Registry coverage: every colour token used in a `haunted:` class or a Normal recipe appears in at least one registry row.
    - Exact-string tests for every export of `src/lib/jobs/copy.ts`; `package.json` dependency fields equal an expected snapshot.
    - Confirm `sourceScan.test.ts` passes unchanged.
    - _Requirements: 3.2, 3.4, 4.2, 16.1, 16.2, 16.3, 16.6, 17.9_

  - [ ]* 3.7 Write switch and badge example tests
    - Switch: role `switch`, name "Haunted mode", off on first load, keeps state after remount with stored `haunted`, Space and Enter each toggle once, focus stays on it, throwing storage still toggles for the page view, and absent from the DOM (not focusable, no replacement text) on an Emergency_Page.
    - `UrgencyBadge.test.tsx`: urgent, soon and monitor `haunted:` tokens contain `-haunted-`; emergency has none.
    - Normal field border is `gray-500`; the baseline from 3.1 still passes.
    - _Requirements: 1.2, 1.3, 1.4, 1.9, 1.10, 2.5, 8.9, 16.5, 17.7_

- [x] 4. Ghost names and Haunted wording
  - [x] 4.1 Add the Trade_Mapper
    - Create `src/lib/haunted/tradeMapper.ts`: `mapTrade(tradeText): GhostTrade | null`, pure, with one frozen array of `{ category, ghostName, needles }` in the order plumb, electric, hvac group, mould group, else Other ("Restless spirit"). Return `null` for blank or non-string input. `tradeDisplayText` is the trimmed text with the first letter upper-cased only when that keeps the lower-case form the same. `label` is `"<ghostName> (<tradeDisplayText>)"`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.11, 6.12_

  - [x] 4.2 Add Haunted_Copy and the wording and ghost components
    - Create `src/lib/haunted/hauntedCopy.ts` (`HAUNTED_COPY` with the seven strings from the design). Do not import from or edit `copy.ts`.
    - Create under `src/components/ui/haunted/`: `ArtBoundary` (renders `null` on error), `GhostIcon` (renders `null` unless effective theme is Haunted; `aria-hidden="true"`, `pointer-events-none`, `data-haunted-art="ghost"`, `currentColor`, no focus or title), `TradeText` (real trade in its own element, plus a `data-ghost` chip with the label only while Haunted), `StateText` (plain line in its own span, haunted line in a second span only while Haunted, optional `role` on the one wrapper).
    - _Requirements: 5.5, 5.6, 5.7, 5.9, 5.10, 6.8, 6.9, 6.10, 7.3, 7.4, 7.7, 15.2, 15.3_

  - [x] 4.3 Show ghost labels on the Results and Pro pages
    - Use `TradeText` in `IssueSummary` ("Who to call"), in `JobFacts` ("Trade") and in `JobListItem`. Pass no trade on emergency views and emergency list rows.
    - _Requirements: 6.7, 6.8, 6.9, 6.13, 13.4, 14.2, 14.4_

  - [x] 4.4 Use `StateText` in the loading and empty states
    - `UploadFlow` ("Inspecting your home…"), `ResultsView` ("Loading your result…"), `StatusPanel` ("Checking your job status…"), `JobDetail` ("Loading the job…"), `JobList` ("Loading jobs…" and "No jobs yet.").
    - Home empty file list in `DropZone`: add the plain line "No photos or video added yet." in both themes, with "No spirits caught yet." and the `GhostIcon` in Haunted. Keep `role="status"` on loading states in both themes.
    - Plain wording is unchanged everywhere else; errors, urgency labels, cost labels, confidence and the upload notice never use `StateText`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 14.1_

  - [x] 4.5 Write property and example tests for the mapper
    - **Property 1: Ghost label carries the real trade** (`src/lib/haunted/tradeMapper.property.test.ts`; at least 100 runs)
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.12, 17.1**
    - **Property 2: Trade mapping is deterministic and case-insensitive** (including each category's ghost name and "Restless spirit" for unknown)
    - **Validates: Requirements 6.6, 6.11, 17.2**
    - Examples: "plumber" gives "Poltergeist (Plumber)"; "electrician" gives "Wraith (Electrician)"; "hvac technician" gives "Banshee (Hvac technician)"; "damp specialist" gives "Ghoul (Damp specialist)"; "chimney sweep" gives "Restless spirit (Chimney sweep)"; blank gives `null`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 17.15_

  - [ ]* 4.6 Write tests for the chips, state text and plain content
    - **Property 3: The haunted trade chip keeps the real trade** (`src/components/ui/haunted/haunted.property.test.tsx`)
    - **Validates: Requirements 6.8, 6.9, 8.1**
    - **Property 4: Haunted lines never replace the plain line**
    - **Validates: Requirements 7.3, 7.4, 7.6, 8.1**
    - **Property 11: Plain content is identical in both themes** (`src/components/results/plainContent.property.test.tsx`; same text, same heading levels and texts, differences only in ghost chips, haunted lines and aria-hidden art)
    - **Validates: Requirements 8.1, 8.3, 8.4, 14.6, 15.4**
    - Examples for the upload-analysis lines and the Home empty-state lines, with the plain line present whenever the haunted line is; the Haunted_Copy module shares no string with `copy.ts`.
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 17.14_

- [x] 5. Display font
  - [x] 5.1 Add the font file, licence and loader
    - Place `Creepster-Regular.ttf` and the unchanged `OFL.txt` from the Creepster download in `src/assets/fonts/creepster/`. If the files cannot be downloaded from the official Google Fonts source, stop and ask the user to supply them.
    - Create `src/app/fonts.ts` with `next/font/local` (`variable: '--font-display'`, `display: 'swap'`, `preload: false`, system fallback). Do not use `next/font/google` and add no npm package.
    - _Requirements: 9.1, 9.2, 9.3, 9.9, 16.2_

  - [x] 5.2 Apply the font to headings under `.theme-haunted`
    - Add `displayFont.variable` to the `<html>` class list in `layout.tsx`.
    - In `globals.css`, add the heading rule from the design, scoped under `.theme-haunted` and selecting only `h1`, `[data-card] h2` and `[data-card] h3`. The card selectors match nothing until task 6 adds `data-card`; that is expected.
    - Add `fontFamily.display` to `tailwind.config.ts`.
    - Use `PAGE_TITLE` on every page `h1` (Home, Results, `/pro`, `/pro/jobs/[id]`) and add `break-words` to headings so a 390 px viewport does not scroll sideways.
    - Normal heading font is unchanged; banners, badges and `p` elements stay in the body font.
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8, 11.3, 14.5_

  - [ ]* 5.3 Write font tests
    - The font file and `OFL.txt` are in the same directory; `package.json` dependencies unchanged; `fonts.ts` uses `next/font/local` and never `next/font/google`; every display-font rule in `globals.css` starts with `.theme-haunted` and selects only `h1` and `[data-card] h2/h3`; the emergency banner contains no display-font rule.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 11.3, 16.2, 17.16_

- [ ] 6. Haunted art
  - [ ] 6.1 Build the art components
    - Create under `src/components/ui/haunted/`: `HeaderSilhouette` (house, tower, chimney, crescent moon; the lit window group has class `hhi-flicker`), `Cobweb` (`absolute right-0 top-0 -z-10 h-14 w-14 opacity-30`), `FogLayer` (`fixed inset-x-0 bottom-0 -z-10 h-[20vh] max-h-[25vh] overflow-hidden`, SVG `w-[200%]` with class `hhi-fog-drift`, `opacity-30`).
    - Each follows the art contract from task 4.2 (`null` unless Haunted, `aria-hidden`, `pointer-events-none`, `data-haunted-art`, `currentColor` with token text classes, wrapped in `ArtBoundary`, no hex, no `rgb()`, no `style` colour). The `hhi-*` classes have no effect until task 7.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ] 6.2 Add the `Card` component
    - Create `src/components/ui/Card.tsx` (`as`: `section`, `div` or `article`; `tone`: `card` or `status`) that renders `data-card`, the recipe class and one `Cobweb` child.
    - Add `relative isolate overflow-hidden` to `CARD` and `STATUS_BOX` in `styles.ts`.
    - _Requirements: 5.2, 5.8, 9.4, 14.1, 14.2_

  - [ ] 6.3 Use cards on the Home page
    - Convert `DataRetentionNotice`, the `DropZone` drop panel and the `UploadFlow` status or error box to `Card`.
    - _Requirements: 5.2, 14.1_

  - [ ] 6.4 Use cards on the Results page
    - Convert `IssueSummary`, `CostRange`, `JobBrief` and `StatusPanel` (`tone="status"`) to `Card`. Keep the `StatusPanel` emergency branch that renders only `EmergencyScope`.
    - _Requirements: 5.2, 14.2, 14.3_

  - [ ] 6.5 Use cards on the Pro pages
    - Convert `AccessCodeForm` (wrapped), `JobFacts` (3 sections), `JobHistory`, `PhotoGallery`, `ActionPanel`, the four `JobDetail` status sections and the `ProEmergencyView` facts section to `Card`. Give `JobListItem` `data-card` and render `<Cobweb />` as its child.
    - _Requirements: 5.2, 13.2, 14.4_

  - [ ] 6.6 Place the header silhouette and fog layer
    - In `layout.tsx`, render `HeaderSilhouette` in the header flow between the site link and the switch, add one `FogLayer`, and add `isolate` to `body`.
    - _Requirements: 5.1, 5.3, 5.8, 14.1_

  - [ ]* 6.7 Write art and card tests
    - Cobweb count equals `[data-card]` count on Home, Results and Pro fixtures; none outside a card; exactly one silhouette and one fog layer in Haunted and none in Normal; every art root has `aria-hidden="true"`, `pointer-events-none` and no `tabIndex` or `title`.
    - `ArtBoundary` hides a throwing child without hiding siblings.
    - Emergency fixtures (Results, reply, Pro job page) contain no `[data-haunted-art]`; extend Property 6 to assert this and no ghost label.
    - Heading levels and order are the same in both themes.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.10, 6.13, 12.8, 13.2, 15.2, 15.4, 17.3_

- [ ] 7. Motion
  - [ ] 7.1 Add the Motion_Stylesheet
    - Create `src/app/haunted-motion.css` with only `hhi-flicker` (4 s, opacity 0.86 to 1.0) and `hhi-fog-drift` (90 s, `translateX(0)` to `translateX(-50%)`), every `animation` declaration under `.theme-haunted`, and a `prefers-reduced-motion: reduce` block that sets `animation: none`, `opacity: 1` and `transform: none` for both classes.
    - Import it once in `layout.tsx`. Keep the existing reduced-motion rule in `globals.css`.
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7, 10.8, 10.9, 10.12, 15.6, 16.6_

  - [ ] 7.2 Remove old animation and transition definitions
    - Delete `animation` (including `flicker` at 0.15 s and `pulse-slow`) and `keyframes` from `tailwind.config.ts`.
    - Remove `transition-colors` from `DropZone` and `transition-[width]` from `UploadProgress`. Normal computed colours stay the same.
    - _Requirements: 10.1, 10.3, 10.4, 16.8_

  - [ ] 7.3 Write motion tests
    - Parse `haunted-motion.css`: exactly two keyframe names; opacity values within 0.85 to 1.0 with a spread of at most 0.15; every duration at least 2 s; fog duration at least 40 s and `transform` only; the reduced-motion block sets `animation: none`; every `animation` declaration starts with `.theme-haunted`.
    - No `@keyframes` or `animation:` in any other file under `src`; `tailwind.config.ts` has no `animation` or `keyframes` and no `flicker`.
    - Emergency fixtures contain no `hhi-flicker` or `hhi-fog-drift` class and no animation or transition class in the banner, badge or Pro note.
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 17.6, 17.16_

  - [ ]* 7.4 Extend the source scan for motion and sound
    - In `hauntedSourceScan.test.ts`, add: no `animate-`, `transition` or `duration-` token in `src/**/*.tsx` (this covers `DropZone` and `UploadProgress`); no `audio` or `video` element, no `autoPlay`, no `AudioContext` in `src`.
    - Confirm `sourceScan.test.ts` still passes unchanged.
    - _Requirements: 10.3, 10.11, 16.3, 17.8_

- [ ] 8. Final checkpoint
  - Run `next lint`, `tsc --noEmit` and `vitest run`. Ensure all tests pass, ask the user if questions arise.
  - Confirm `src/lib/jobs/copy.ts`, `src/lib/emergency/messages.ts` text, `src/lib/safety/`, `package.json` dependency fields and `sourceScan.test.ts` have no changes beyond what the constraints allow.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Skipping them leaves the app working but removes the safety net, so the property tests for emergency pages (1.6) and contrast (2.4) are strongly recommended.
- Each parent task can be the last one run. After each one, lint, `tsc` and the tests pass and the Normal theme is unchanged except the field border.
- Order inside a task matters where noted: 3.1 before 3.2, 3.3 before 3.5, 6.1 and 6.2 before 6.3 to 6.6.
- Browser checks at 320, 390 and 1920 px (Req 14.5, 5.8) are manual and are not coding tasks.
- Each property carries the comment `// Feature: haunted-mode, Property N: <text>` and runs at least 100 cases.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "1.7"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.5", "1.6"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "2.3"] },
    { "id": 5, "tasks": ["2.4", "2.5"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.2"] },
    { "id": 8, "tasks": ["3.3", "3.4"] },
    { "id": 9, "tasks": ["3.5"] },
    { "id": 10, "tasks": ["3.6", "3.7"] },
    { "id": 11, "tasks": ["4.1"] },
    { "id": 12, "tasks": ["4.2", "4.5"] },
    { "id": 13, "tasks": ["4.3", "4.4"] },
    { "id": 14, "tasks": ["4.6"] },
    { "id": 15, "tasks": ["5.1"] },
    { "id": 16, "tasks": ["5.2"] },
    { "id": 17, "tasks": ["5.3"] },
    { "id": 18, "tasks": ["6.1", "6.2"] },
    { "id": 19, "tasks": ["6.3", "6.4", "6.5", "6.6"] },
    { "id": 20, "tasks": ["6.7"] },
    { "id": 21, "tasks": ["7.1", "7.2"] },
    { "id": 22, "tasks": ["7.3", "7.4"] }
  ]
}
```
