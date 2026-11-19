# Requirements Document

## Introduction

The haunted-mode feature turns the existing Haunted theme into a Halloween theme that feels haunted and still helps homeowners understand their problem. It builds on what the App already has: the `ThemeToggle` component, the `theme-haunted` class on the root element, the `hhi_theme` localStorage setting, the `haunted:` Tailwind variant and the `haunted.*` colour tokens.

The Haunted theme covers the home page (`/`), the results page (`/inspect/[id]`, including the homeowner Status_Panel with its reply box, time picker and booking confirmation) and the Pro pages (`/pro`, including the access code form and job list, and `/pro/jobs/[id]`). It has a near-black, deep purple and candle orange palette, original SVG and CSS art (a haunted-house silhouette with a moon in the header, cobwebs in card corners, a slow fog layer along the bottom), ghost names for trades, haunted wording in loading and empty states only, a slow candle flicker and fog drift, and the Creepster display font (SIL Open Font License 1.1) for headings only. The switch is off by default, there is no sound, all motion stops under `prefers-reduced-motion`, and the feature adds no npm packages.

Haunted wording and art are decoration around the content. The diagnosis, costs, urgency labels and error messages keep their plain words and are always visible. The rules in `safety.md` take priority over the theme: the emergency banner is never themed, and an emergency result page is shown in the Normal theme even when Haunted mode is on, and the Haunted_Switch is hidden on that page while the stored theme stays unchanged. The same rule covers the emergency message shown after a homeowner reply and the Pro emergency note. A result is only known to be an emergency after it loads in the browser, so the root class cannot always be removed before first paint. For that reason the safety guarantee comes from the banner, the badge and the Pro note, which carry no `haunted:` classes and a fixed high-contrast style whatever the root class is. The App also removes the root class in the same render that shows the emergency, in a layout effect, before paint wherever the emergency is already known.

Today `EmergencyBanner.tsx` and the emergency level in `UrgencyBadge.tsx` carry `haunted:` colour classes. This feature removes them so both use one fixed high-contrast style in both themes.

### Existing code this feature touches

| Area | Current state |
|---|---|
| `src/lib/theme.ts` | `Theme` type, `hhi_theme` key, `theme-haunted` class, `applyTheme`, `readStoredTheme`, `storeTheme` |
| `src/components/ThemeToggle.tsx` | A `button` with `aria-pressed`, `aria-label="Haunted theme"` and visible text "Haunted mode: On/Off" |
| `src/app/layout.tsx` | Header with the toggle on every page; inline script applies the stored theme before first paint |
| `tailwind.config.ts` | `haunted.*` colour tokens (purple accent), `haunted` variant, `flicker` animation with a 0.15 s period |
| `src/app/globals.css` | Root colour variables, a `prefers-reduced-motion` rule, `.theme-haunted` variables |
| `src/components/ui/styles.ts` and result components | `haunted:` classes that use raw Tailwind palette colours such as `slate-900` and `purple-100` |
| `src/components/results/EmergencyBanner.tsx`, `UrgencyBadge.tsx` | `haunted:` colour classes on the emergency banner and the emergency badge |
| `src/components/sourceScan.test.ts` | Fails on hex or `rgb()` colours, colour style properties, `animate-`, `transition` and `duration-` classes, and unnamed or ring-less interactive elements in `src/components/pro`, `src/components/ui`, `src/app/pro` and six named results and upload files |

### Out of scope

- Sound of any kind.
- Changes to `src/lib/jobs/copy.ts`, to `EMERGENCY_MESSAGE` and the other texts in `src/lib/emergency/messages.ts`, and to anything in `src/lib/safety/`.
- New npm packages.
- Haunted treatment of the plain diagnosis text, costs, urgency labels or error messages.

## Glossary

- **App**: The Haunted House Inspector Next.js web application.
- **User**: A Homeowner or a Pro_User using the App in a browser.
- **Homeowner**: A User who created a Job and follows it on the Results_Page.
- **Pro_User**: A tradesperson using the Pro_Pages.
- **Normal_Theme**: The default light theme, shown when the root element does not have the Haunted_Class.
- **Theme**: One of Normal or Haunted.
- **Theme_Value**: The string `normal` or `haunted`, which names a Theme in the Theme_Setting.
- **Haunted_Class**: The class `theme-haunted` on the root element.
- **Haunted_Theme**: The theme shown while the root element has the Haunted_Class.
- **Haunted_Mode**: The User's choice to see the Haunted_Theme, stored under the Theme_Setting.
- **Theme_Setting**: The localStorage entry `hhi_theme`; the Theme_Value `haunted` means Haunted_Mode is on, and any other value or a missing entry means it is off.
- **Haunted_Switch**: A switch (an ARIA `role="switch"` control) in the page header that turns Haunted_Mode on and off. It is hidden on an Emergency_Page.
- **Home_Page**: The page `/`.
- **Results_Page**: The page `/inspect/[id]`, rendered by `ResultsView`.
- **Status_Panel**: The Client Component on the Results_Page that shows the Job status, the question from the tradesperson, the reply box, the Time_Slot picker and the booking confirmation.
- **Pro_Pages**: The pages `/pro` (access code form and job list) and `/pro/jobs/[id]` (job page).
- **Emergency_Result**: A result or Job with urgency `emergency`, or with `isEmergency` true, or with Job status `emergency`.
- **Emergency_Page**: Any page view that shows an Emergency_Result: the Results_Page for an Emergency_Result, the Results_Page after a Homeowner reply or booking returns the emergency outcome (error code `JOB_IS_EMERGENCY`) or a status poll returns `emergency`, and the Pro job page for an Emergency_Result.
- **Emergency_Banner**: The `EmergencyBanner` component, which shows `EMERGENCY_MESSAGE`.
- **Emergency_Badge**: The `UrgencyBadge` component rendered with urgency `emergency`.
- **Emergency_Message**: The exact text in `EMERGENCY_MESSAGE` from `src/lib/emergency/messages.ts`.
- **Pro_Emergency_Note**: The exact text in `PRO_EMERGENCY_NOTE` from `src/lib/emergency/messages.ts`, shown by `ProEmergencyView`.
- **Emergency_Content**: The Emergency_Banner, the Emergency_Badge, the Emergency_Message wherever shown, and the Pro_Emergency_Note.
- **Fixed_Emergency_Elements**: The Emergency_Banner, the Emergency_Badge and the Pro_Emergency_Note, each of which carries a fixed high-contrast style and no class token that starts with `haunted:`.
- **Haunted_Palette**: The set of Haunted colours: near-black backgrounds, deep purple surfaces and borders, candle orange accents and light text, defined only as the `haunted.*` tokens in `tailwind.config.ts` or as CSS variables under `.theme-haunted`.
- **Colour_Pair**: One text, icon or border colour drawn on one background colour, in the Normal_Theme or the Haunted_Theme.
- **Contrast_Registry**: A single typed list in the code of every Colour_Pair with its theme, its role (body text, large text or non-text component) and its two colour values.
- **Contrast_Ratio**: The WCAG 2.x relative-luminance contrast ratio of the two colours of a Colour_Pair.
- **Large_Text**: Text of at least 24 px, or at least 18.66 px and bold.
- **Haunted_Art**: The decorative SVG and CSS graphics of the Haunted_Theme: the Header_Silhouette, the Cobweb, the Fog_Layer and the Ghost_Icon.
- **Header_Silhouette**: The haunted-house silhouette with a crescent moon in the page header.
- **Cobweb**: The cobweb graphic in the top corner of a card.
- **Fog_Layer**: The slow fog graphic along the bottom of the page.
- **Ghost_Icon**: A small ghost graphic used in the trade chip and in empty states.
- **Trade_Text**: The `trade` string of a result or Job (for example "plumber").
- **Trade_Category**: One of Plumbing, Electrical, Heating and cooling, Moisture and mould, or Other.
- **Ghost_Name**: The name paired with a Trade_Category: Poltergeist for Plumbing, Wraith for Electrical, Banshee for Heating and cooling, Ghoul for Moisture and mould, and Restless spirit for Other. The Trade_Category only selects the Ghost_Name.
- **Trade_Display_Text**: The Trade_Text trimmed of surrounding whitespace, with its first letter in upper case and the remaining characters unchanged.
- **Ghost_Trade_Label**: The text "<Ghost_Name> (<Trade_Display_Text>)", for example "Poltergeist (Plumber)" for the Trade_Text "plumber" and "Restless spirit (Chimney sweep)" for the Trade_Text "chimney sweep". It always contains the real trade.
- **Trade_Mapper**: The pure function that takes a Trade_Text and returns its Trade_Category, its Ghost_Name and its Ghost_Trade_Label; it performs no I/O.
- **Haunted_Copy**: The set of haunted wording strings kept in a module separate from `src/lib/jobs/copy.ts`.
- **Loading_State**: A view that tells the User the App is waiting for data or analysis (for example "Inspecting your home…", "Loading your result…", "Loading the job…").
- **Upload_Analysis_State**: The Loading_State shown while an uploaded inspection is analysed, whose plain line is "Inspecting your home…".
- **Empty_State**: A view that tells the User there is nothing to show yet (for example the empty file list on the Home_Page, whose plain line is "No photos or video added yet.", and "No jobs yet." on the job list).
- **Plain_Content**: The diagnosis (likely issue, trade, follow-up questions, do-it-yourself steps), cost range, confidence, job brief, urgency labels, status texts and error messages.
- **Haunted_Motion**: The candle flicker and fog drift animations.
- **Motion_Stylesheet**: The one CSS file that holds every Haunted_Motion keyframe and animation declaration.
- **Reduced_Motion_Setting**: The browser setting that matches the media query `prefers-reduced-motion: reduce`.
- **Display_Font**: The Creepster font (SIL Open Font License 1.1), stored as a font file in the repository and loaded with `next/font/local`; it is used for headings only.
- **Font_Licence_File**: The file `OFL.txt` from the Creepster download, committed in the same directory as the Display_Font file.
- **Source_Scan_Test**: The existing test `src/components/sourceScan.test.ts`.

## Requirements

### Requirement 1: Haunted mode switch

**User Story:** As a User, I want a clearly labelled "Haunted mode" switch in the header, so that I can turn the Haunted_Theme on and off with a mouse, a touch screen or a keyboard.

#### Acceptance Criteria

1. THE App SHALL render exactly one Haunted_Switch in the page header of every page, including the Home_Page, the Results_Page and the Pro_Pages, except on an Emergency_Page, where THE App SHALL hide the Haunted_Switch.
2. THE Haunted_Switch SHALL expose the role `switch` with a checked state that is true while Haunted_Mode is on and false while it is off.
3. THE Haunted_Switch SHALL show the visible text "Haunted mode", and the accessible name of the Haunted_Switch SHALL contain that visible text.
4. WHEN the User activates the Haunted_Switch with a pointer, a touch tap, the Space key or the Enter key, THE Haunted_Switch SHALL toggle Haunted_Mode exactly once per activation.
5. WHEN Haunted_Mode is toggled, THE App SHALL add or remove the Haunted_Class on the root element within 100 milliseconds of the activation, without a page reload and without losing any text the User has entered on the page.
6. THE Haunted_Switch SHALL be reachable with the Tab key in the normal page tab order, and WHILE the Haunted_Switch has keyboard focus, THE Haunted_Switch SHALL show a focus indicator with a Contrast_Ratio of at least 3:1 against its adjacent colours in both Normal and Haunted themes.
7. THE Haunted_Switch SHALL show its on and off state with a visible text label or shape that differs between the two states, in addition to a colour change, so that the state does not depend on colour alone.
8. THE Haunted_Switch SHALL present a touch target of at least 44 by 44 CSS pixels.
9. IF the User's Haunted_Mode preference cannot be read from or saved to browser storage, THEN THE App SHALL start in Normal theme, keep the Haunted_Switch operable for the current page view, and show no error to the User.
10. THE Haunted_Switch SHALL be off when the User has never set it, so that Haunted_Mode is off by default.

### Requirement 2: Theme default and persistence

**User Story:** As a User, I want Haunted mode to be off at first and to be remembered, so that the App opens the way I left it.

#### Acceptance Criteria

1. WHILE the Theme_Setting is missing, THE App SHALL show the Normal_Theme and SHALL NOT add the Haunted_Class to the page.
2. WHEN the User toggles Haunted_Mode, THE App SHALL apply the new theme to the current page within 100 ms and SHALL store `haunted` or `normal` under the Theme_Setting, so that `haunted` is stored when Haunted_Mode is turned on and `normal` is stored when it is turned off.
3. WHEN a page loads and the Theme_Setting is `haunted`, THE App SHALL add the Haunted_Class before the first paint, so that no frame in the Normal_Theme is shown.
4. IF the Theme_Setting holds a value other than exactly `haunted` or `normal` (including an empty string, a different letter case, or a value longer than 32 characters), THEN THE App SHALL show the Normal_Theme, SHALL NOT add the Haunted_Class, and SHALL show no error to the User.
5. IF localStorage is unavailable (access throws an error or reading or writing fails), THEN THE App SHALL still toggle the theme for the current page view, SHALL show the Normal_Theme on the next page load, and SHALL show no error to the User.
6. FOR ALL Theme values in {`haunted`, `normal`}, reading the Theme_Setting after storing a Theme value SHALL return the same Theme value (round-trip property).
7. WHEN a page loads and the Theme_Setting is `normal`, THE App SHALL show the Normal_Theme and SHALL NOT add the Haunted_Class.

### Requirement 3: Haunted palette

**User Story:** As a User, I want a dark, candle-lit look in Haunted mode, so that the App feels haunted.

#### Acceptance Criteria

1. WHILE the Haunted_Class is present, THE App SHALL render page backgrounds in near-black, card surfaces and card borders in deep purple, and headings, primary buttons and accent elements in candle orange, each taken from the Haunted_Palette.
2. THE App SHALL define each Haunted_Palette colour exactly once, either as a `haunted.*` token in `tailwind.config.ts` or as a CSS variable under `.theme-haunted`, and SHALL NOT define any Haunted_Palette colour as a literal hex, rgb or hsl value anywhere else in `src/`.
3. WHILE the Haunted_Class is present, THE App SHALL draw every colour on the Home_Page, the Results_Page and the Pro_Pages from the Haunted_Palette.
4. THE App SHALL NOT use raw Tailwind palette colour classes (for example `slate-900` or `purple-100`) in any `haunted:` variant on the Home_Page, the Results_Page or the Pro_Pages.
5. WHILE the Haunted_Class is absent, THE App SHALL render every Normal_Theme colour on the Home_Page, the Results_Page and the Pro_Pages with the same computed value as before this change, with one allowed exception: the Normal_Theme form-field border SHALL change from gray-400 to gray-500 so that it meets a Contrast_Ratio of 3:1. Replacing a raw palette colour class with a token that has the same computed value is allowed.
6. WHILE the Haunted_Class is present, THE App SHALL render the background of every primary button in candle orange.
7. WHILE the Haunted_Class is present, THE App SHALL render body text, heading text, primary button text and link text on their backgrounds with a WCAG contrast ratio of at least 4.5:1 (at least 3:1 for text of 24px or larger, or 18.66px or larger and bold).

### Requirement 4: Contrast in both themes

**User Story:** As a User with low vision, I want readable text in both themes, so that I can read the diagnosis whichever theme is on.

#### Acceptance Criteria

1. THE Contrast_Registry SHALL list every Colour_Pair used for text, icons, borders of form fields, buttons and the Haunted_Switch in the Normal_Theme and in the Haunted_Theme, and each entry SHALL record the foreground colour, the background colour, the role (body text, Large_Text, or non-text component), and the theme.
2. THE App SHALL use only Colour_Pairs that are in the Contrast_Registry.
3. THE Contrast_Ratio of every body-text Colour_Pair in the Contrast_Registry SHALL be at least 4.5:1.
4. THE Contrast_Ratio of every Large_Text Colour_Pair and every non-text component Colour_Pair in the Contrast_Registry SHALL be at least 3:1.
5. WHERE the Fog_Layer or another Haunted_Art layer lies behind text, THE Contrast_Registry SHALL hold the Colour_Pair computed against the background colour with that layer at its maximum opacity and brightness, and that Colour_Pair SHALL meet the minimum Contrast_Ratio for its role.
6. THE design document SHALL list every Haunted_Theme Colour_Pair with its Contrast_Ratio, expressed to two decimal places.
7. IF a Colour_Pair in the Contrast_Registry has a Contrast_Ratio below the minimum for its role, THEN THE Contrast_Registry test SHALL fail and SHALL identify that Colour_Pair, its theme, its role, its measured Contrast_Ratio and the required minimum.
8. FOR ALL Colour_Pairs in the Contrast_Registry, THE Contrast_Ratio SHALL meet the minimum for its role (property).

### Requirement 5: Original Haunted art

**User Story:** As a User, I want original spooky art around the page, so that the App feels haunted without covering what I need to read.

#### Acceptance Criteria

1. WHILE the Haunted_Class is present, THE App SHALL show exactly one Header_Silhouette inside the page header on every page of the App.
2. WHILE the Haunted_Class is present, THE App SHALL show exactly one Cobweb in the top corner of each card on the Home_Page, the Results_Page and the Pro_Pages, and SHALL show no Cobweb outside a card.
3. WHILE the Haunted_Class is present, THE App SHALL show exactly one Fog_Layer anchored to the bottom edge of the viewport and spanning the full viewport width, with a rendered height of no more than 25% of the viewport height.
4. WHILE the Haunted_Class is absent, THE App SHALL render zero Haunted_Art elements in the DOM or, for any Haunted_Art element that remains in the DOM, SHALL give it a computed `display` of `none`.
5. THE App SHALL draw all Haunted_Art as SVG or CSS authored for this project, and SHALL NOT include copyrighted characters, logos or fonts.
6. THE App SHALL mark each purely decorative Haunted_Art element with `aria-hidden="true"` and SHALL NOT make it focusable or give it an accessible name.
7. THE App SHALL render each Haunted_Art element with a computed `pointer-events` of `none`.
8. WHILE the Haunted_Class is present, THE App SHALL render Haunted_Art so that its bounding box does not overlap the bounding box of any text, button or form field at viewport widths from 320 px to 1920 px, or SHALL render it behind that content in stacking order.
9. THE Haunted_Art components that sit in directories scanned by the Source_Scan_Test SHALL take their colours from `currentColor` or from CSS variables, and SHALL NOT contain hex colours (`#rgb`, `#rrggbb`, `#rrggbbaa`) or `rgb()`/`rgba()` colours.
10. IF a Haunted_Art asset fails to load or render, THEN THE App SHALL continue to display all page text, buttons and form fields and SHALL NOT show a broken-image icon or an error message to the User.

### Requirement 6: Ghost names for trades

**User Story:** As a Homeowner or a Pro_User, I want ghost names beside the real trade, so that the theme is playful and the real trade is still clear.

#### Acceptance Criteria

1. WHEN the Trade_Text, after trimming surrounding whitespace, contains "plumb" (case-insensitive), THE Trade_Mapper SHALL return the Trade_Category Plumbing, the Ghost_Name "Poltergeist" and the Ghost_Trade_Label "Poltergeist (<Trade_Display_Text>)", so that the Trade_Text "plumber" gives "Poltergeist (Plumber)".
2. WHEN the Trade_Text, after trimming surrounding whitespace, contains "electric" (case-insensitive) and does not match Plumbing, THE Trade_Mapper SHALL return the Trade_Category Electrical, the Ghost_Name "Wraith" and the Ghost_Trade_Label "Wraith (<Trade_Display_Text>)", so that the Trade_Text "electrician" gives "Wraith (Electrician)".
3. WHEN the Trade_Text, after trimming surrounding whitespace, contains "hvac", "heating", "cooling", "furnace", "boiler" or "air condition" (case-insensitive) and does not match Plumbing or Electrical, THE Trade_Mapper SHALL return the Trade_Category Heating and cooling, the Ghost_Name "Banshee" and the Ghost_Trade_Label "Banshee (<Trade_Display_Text>)", so that the Trade_Text "hvac technician" gives "Banshee (Hvac technician)".
4. WHEN the Trade_Text, after trimming surrounding whitespace, contains "mould", "mold", "damp" or "moisture" (case-insensitive) and does not match Plumbing, Electrical or Heating and cooling, THE Trade_Mapper SHALL return the Trade_Category Moisture and mould, the Ghost_Name "Ghoul" and the Ghost_Trade_Label "Ghoul (<Trade_Display_Text>)", so that the Trade_Text "damp specialist" gives "Ghoul (Damp specialist)".
5. WHEN the Trade_Text is not blank and matches none of the Trade_Categories in criteria 1 to 4, THE Trade_Mapper SHALL return the Trade_Category Other, the Ghost_Name "Restless spirit" and the Ghost_Trade_Label "Restless spirit (<Trade_Display_Text>)".
6. THE Trade_Mapper SHALL match the Trade_Text without regard to letter case, so that "PLUMBER", "Plumber" and "plumber" return the same Trade_Category and Ghost_Trade_Label.
7. IF the Trade_Text is blank (empty, or containing only whitespace characters), THEN THE App SHALL show no Ghost_Trade_Label and SHALL show the same trade output as the Normal_Theme.
8. WHILE the Haunted_Class is present, THE App SHALL show the Ghost_Trade_Label in the trade chip on the Results_Page and in every place on the Pro_Pages that shows a trade, and the visible Ghost_Trade_Label SHALL contain the real trade from the result.
9. WHILE the Haunted_Class is absent, THE App SHALL show the Trade_Text unchanged, with no Ghost_Trade_Label and no Ghost_Name.
10. WHEN a Ghost_Icon accompanies a Ghost_Trade_Label, THE App SHALL give the Ghost_Icon a text alternative that contains the Ghost_Name and the real trade, or SHALL hide the Ghost_Icon from assistive technology while the visible Ghost_Trade_Label carries the same text.
11. WHEN the Trade_Mapper is called repeatedly with the same Trade_Text, THE Trade_Mapper SHALL return an identical Trade_Category and Ghost_Trade_Label on every call, with no dependence on time, randomness or prior calls.
12. FOR ALL Trade_Text strings that are not blank, THE Ghost_Trade_Label SHALL equal "<Ghost_Name> (<Trade_Display_Text>)" and SHALL therefore contain the trimmed Trade_Text as a case-insensitive substring (property).
13. THE Emergency_Page SHALL show no Ghost_Trade_Label and no Ghost_Name.

### Requirement 7: Haunted wording only in loading and empty states

**User Story:** As a Homeowner, I want a little haunted flavour while I wait, so that waiting feels lighter, without losing any meaning.

#### Acceptance Criteria

1. WHILE the Haunted_Class is present and the App shows a Loading_State, THE App SHALL show a haunted line from the Haunted_Copy, and for the Upload_Analysis_State the plain line SHALL read "Inspecting your home…" and the haunted line SHALL read "The inspector is walking the halls…".
2. WHILE the Haunted_Class is present and the App shows an Empty_State, THE App SHALL show a haunted line from the Haunted_Copy, and for the empty file list on the Home_Page the plain line SHALL read "No photos or video added yet." and the haunted line SHALL read "No spirits caught yet.".
3. WHILE the Haunted_Class is present and the App shows a Loading_State or an Empty_State, THE App SHALL always show the haunted line together with the plain line the Normal_Theme shows for that same state, and SHALL never show the haunted line instead of the plain line, with both lines in the DOM and in the accessibility tree at the same time.
4. WHILE the App shows a Loading_State, THE App SHALL keep the Loading_State status message, in both the Normal_Theme and the Haunted_Theme, inside one element with the role `status`.
5. WHEN the Haunted_Class is toggled on or off while a Loading_State or an Empty_State is visible, THE App SHALL update the visible lines within 100 milliseconds and SHALL keep the plain line visible before and after the toggle.
6. THE App SHALL show haunted wording only in Loading_States and Empty_States, and SHALL show the Normal_Theme wording for every other text, including the emergency message, urgency labels, cost labels, confidence level, error messages, and the upload notice.
7. THE Haunted_Copy SHALL be kept in a module other than `src/lib/jobs/copy.ts`.

### Requirement 8: Plain words stay plain

**User Story:** As a Homeowner, I want the diagnosis, costs, urgency and errors in plain words, so that spooky styling never hides what matters.

#### Acceptance Criteria

1. WHEN a page renders in either the Normal_Theme or the Haunted_Theme, THE App SHALL show every item of Plain_Content with character-for-character identical text in both themes.
2. WHILE the Haunted_Class is present, THE App SHALL render every item of Plain_Content in the current body font and SHALL NOT apply any decorative or themed font to it.
3. THE App SHALL leave the text of every string exported from `src/lib/jobs/copy.ts` unchanged by theme, so that the text shown in the Haunted_Theme is identical to the text shown in the Normal_Theme.
4. WHEN a result is shown in the Haunted_Theme, THE App SHALL show the urgency label for the result's urgency level, for each of the levels `emergency`, Urgent (act today), Soon (within a week) and Monitor (keep an eye on it), with the same wording as in the Normal_Theme.
5. WHEN a cost range is shown in either theme, THE App SHALL show the cost label "rough range, not a quote" next to it.
6. WHEN a result is shown in either theme, THE App SHALL show the confidence level next to the diagnosis.
7. WHILE the Haunted_Class is present, THE App SHALL show every error message with the same wording as in the Normal_Theme, in a Colour_Pair listed in the Contrast_Registry.
8. IF an error message is shown while the Haunted_Class is present, THEN THE App SHALL keep the message visible until the user dismisses it or leaves the page, and SHALL NOT replace it with themed or decorative wording.
9. WHERE the urgency is not `emergency`, WHILE the Haunted_Theme is active, THE UrgencyBadge SHALL use colours from the Haunted_Palette.
10. WHERE the urgency is `emergency`, THE UrgencyBadge SHALL use the same colours in the Haunted_Theme as in the Normal_Theme.

### Requirement 9: Display font

**User Story:** As a User, I want spooky headings that load without a network request to a third party, so that the theme looks right and stays private.

#### Acceptance Criteria

1. THE App SHALL load the Display_Font (Creepster) from a font file stored in the repository with `next/font/local`, and THE App SHALL make 0 network requests to any third-party host to fetch the Display_Font at build time or at run time.
2. THE Display_Font SHALL be licensed under the SIL Open Font License 1.1, and the repository SHALL contain the Font_Licence_File (`OFL.txt` from the Creepster download) in the same directory as the font file.
3. THE App SHALL NOT add an npm package for the Display_Font, so the dependency list in `package.json` SHALL be unchanged by the Display_Font.
4. WHILE the Haunted_Class is present, THE App SHALL render every page heading (h1) and card heading (the h2 or h3 title inside a Card) in the Display_Font, and THE App SHALL render all other text elements in the current body font.
5. THE App SHALL render body text in the current body font, unchanged by this feature, in both the Normal theme and the Haunted_Theme.
6. WHILE the Haunted_Class is absent, THE App SHALL render headings in the same font family as before the Display_Font was added.
7. IF the Display_Font file fails to load, THEN THE App SHALL render headings in the current body font, SHALL display 100% of the heading text, and SHALL keep the page layout usable with no horizontal scrolling at a 390 px viewport width.
8. WHILE the Haunted_Class is present, THE App SHALL render each heading drawn in the Display_Font in a Colour_Pair from the Contrast_Registry that meets a contrast ratio of at least 3:1 when the heading qualifies as Large_Text, and at least 4.5:1 when it does not.
9. WHEN the Display_Font is loading, THE App SHALL show heading text in the current body font, so that heading text is visible within 100 ms of first paint.

### Requirement 10: Motion

**User Story:** As a User, I want gentle motion that never flashes and that stops when I ask for less motion, so that the theme is safe and comfortable.

#### Acceptance Criteria

1. THE App SHALL animate only two things: a candle flicker and a fog drift, and SHALL define no other animation or transition on any element in either theme.
2. THE App SHALL declare every keyframe and animation of the Haunted_Motion in the Motion_Stylesheet, scoped under `.theme-haunted`.
3. THE App SHALL NOT use `animate-`, `transition` or `duration-` utility classes in any component.
4. THE App SHALL NOT define an animation in the `animation` or `keyframes` sections of `tailwind.config.ts`, and SHALL remove the existing `flicker` entry with its 0.15 s period.
5. THE candle flicker SHALL change opacity by at most 0.15 between its lowest and its highest value, with every opacity value within the range 0.85 to 1.0.
6. THE duration of every Haunted_Motion animation cycle, including every cycle of the candle flicker, SHALL be at least 2 seconds, so that nothing flashes more than 3 times per second.
7. THE fog drift SHALL use a cycle of at least 40 seconds, SHALL move only by translation, and SHALL NOT change opacity by more than 0.15 between its lowest and its highest value.
8. WHILE the Reduced_Motion_Setting is on, THE App SHALL run no animation, transition or auto-moving effect anywhere, THE Motion_Stylesheet SHALL set `animation` to `none` for every Haunted_Motion element, and THE App SHALL show each of those elements in a static state: the candle flicker at full opacity (1.0), and the fog drift with no translation offset and with its constant faint opacity (`opacity-30`) unchanged.
9. WHILE the Haunted_Class is absent, THE App SHALL run no Haunted_Motion, and WHEN the Haunted_Class is removed, THE App SHALL stop every Haunted_Motion within 100 milliseconds.
10. THE Emergency_Content SHALL run no animation or transition in either theme, including while the Haunted_Class is present and while the Reduced_Motion_Setting is off.
11. THE App SHALL play no sound, and SHALL contain no `audio` or `video` element, no `autoPlay` attribute and no Web Audio use for the theme.
12. IF the Reduced_Motion_Setting changes while a page is open, THEN THE App SHALL apply the new setting to the Haunted_Motion without requiring a page reload.

### Requirement 11: Emergency banner and badge are never themed

**User Story:** As a Homeowner in danger, I want the emergency warning to look the same in every theme, so that I can read it at once.

#### Acceptance Criteria

1. THE Emergency_Banner SHALL use one fixed colour style, the same in the Normal theme and the Haunted theme, and SHALL have zero class tokens that start with `haunted:` on itself or any descendant element.
2. THE Emergency_Badge SHALL use one fixed colour style, the same in the Normal theme and the Haunted theme, and SHALL have zero class tokens that start with `haunted:` on itself or any descendant element.
3. THE Emergency_Banner SHALL render all of its text in the current body font, and no element inside it SHALL use the Display_Font.
4. THE Emergency_Banner SHALL contain the Emergency_Message as its only text content, and SHALL contain zero Ghost_Name, Ghost_Icon, Cobweb and Fog_Layer elements and zero CSS animations or transitions.
5. THE Contrast_Registry SHALL list the text and background Colour_Pair of the Emergency_Banner and the text and background Colour_Pair of the Emergency_Badge, and each listed Colour_Pair SHALL have a Contrast_Ratio of at least 4.5:1 in both the Normal theme and the Haunted theme.
6. THE Emergency_Banner SHALL have the role `alert` and an assertive live region in both themes, and SHALL keep both after any theme toggle.
7. THE Emergency_Banner SHALL display the Emergency_Message as the exact string "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside." with no characters added, removed or changed, in both themes.
8. IF the urgency is "emergency", THEN THE Emergency_Banner and the Emergency_Badge SHALL both be rendered, and IF the urgency is not "emergency", THEN THE system SHALL render neither of them.
9. FOR ALL urgency inputs and both theme settings, THE rendered Emergency_Content SHALL contain zero class tokens that start with `haunted:` and zero Haunted_Art elements (property).
10. WHILE the root element has the Haunted_Class, THE Emergency_Banner, THE Emergency_Badge and THE Pro_Emergency_Note SHALL each keep the same fixed high-contrast classes and the same computed colours as with the Haunted_Class absent.

### Requirement 12: Emergency result page shows in the Normal theme

**User Story:** As a Homeowner in danger, I want an emergency result to show in the Normal theme even if Haunted mode is on, so that nothing spooky sits next to the warning.

#### Acceptance Criteria

1. WHEN the Results_Page loads an Emergency_Result while Haunted_Mode is on, THE App SHALL remove the Haunted_Class from the root element in the same render that shows the Emergency_Message (in a layout effect, before paint wherever the emergency is already known), so that the rest of the page is in the Normal_Theme with no Haunted_Art, no Ghost_Name and no Display_Font, and SHALL hide the Haunted_Switch.
2. WHEN a Homeowner reply or booking returns the emergency outcome (error code `JOB_IS_EMERGENCY`) or a status poll returns the status `emergency`, THE App SHALL show the Emergency_Message and SHALL switch the whole page to the Normal_Theme within the same render, without a page reload.
3. IF a Homeowner reply or booking returns the emergency outcome while a form on the Results_Page holds unsent input, THEN THE App SHALL hide the reply and booking forms, SHALL show the Emergency_Message, and SHALL keep the stored job data unchanged.
4. WHILE the Results_Page shows an Emergency_Page, THE App SHALL leave the stored Theme_Setting value unchanged.
5. WHILE the Results_Page shows an Emergency_Page, THE App SHALL hide the Haunted_Switch (not render it as disabled), so that the Haunted_Switch cannot be focused or activated, and THE App SHALL show no replacement text or explanation in its place.
6. WHEN the User moves from an Emergency_Page to a page that is not an Emergency_Page (for example with "Start a new inspection") and the Theme_Setting is `haunted`, THE App SHALL show the Haunted_Theme on that page within the same render, without a page reload, and SHALL show the Haunted_Switch in its on state.
7. THE Results_Page SHALL show no do-it-yourself steps, trade, cost range or job brief for an Emergency_Result, as it does today.
8. FOR ALL Emergency_Results and both Theme_Setting values (`normal` and `haunted`), THE rendered Emergency_Page SHALL have no Haunted_Class on the root element once the emergency is shown, SHALL contain no Haunted_Art and no Ghost_Name, and the Fixed_Emergency_Elements SHALL contain no class token that starts with `haunted:` (property).
9. IF the result is known to be an emergency only after it loads in the browser, THEN THE Fixed_Emergency_Elements SHALL carry a fixed high-contrast style and no `haunted:` classes, so that they stay readable in any frame painted while the root element still has the Haunted_Class.

### Requirement 13: Pro emergency note and Pro emergency job page

**User Story:** As a Pro_User, I want the emergency note to be plain and unthemed, so that I read it the way the safety rules intend.

#### Acceptance Criteria

1. WHEN the Pro job page loads an Emergency_Result, THE App SHALL render the whole page in the Normal_Theme and SHALL show the Pro_Emergency_Note as a character-for-character copy of the `PRO_EMERGENCY_NOTE` text, with no added, removed, reordered or reworded characters.
2. WHEN the Pro job page loads an Emergency_Result, THE App SHALL remove the Haunted_Class from the root element in the same render, so that the rest of the page is in the Normal_Theme, and THE Pro_Emergency_Note, THE Emergency_Banner and THE Emergency_Badge on the page SHALL contain no class token that starts with `haunted:`; the page SHALL show zero Ghost_Name elements, zero Ghost_Icon elements, zero Haunted_Art elements, zero elements using the Display_Font and zero running animations or transitions.
3. WHILE the Pro job page shows an Emergency_Page, THE App SHALL keep the stored Theme_Setting value unchanged and SHALL hide the Haunted_Switch as in Requirement 12, criterion 5.
4. WHERE a job in the Pro job list has an emergency status, THE job list item SHALL show the Emergency_Badge with its fixed style and SHALL show no Ghost_Name for that job.
5. WHEN the Pro_User leaves the Pro Emergency_Page and the stored Theme_Setting is `haunted`, THE App SHALL render the Haunted_Theme on the destination page within 500 ms of that page finishing its load.

### Requirement 14: Page coverage

**User Story:** As a User, I want the same Haunted look on every in-scope page, so that the theme feels like one product.

#### Acceptance Criteria

1. WHILE the Haunted_Class is present, THE Home_Page SHALL show the Haunted_Palette, the Header_Silhouette, the Fog_Layer, one Cobweb in each card, the Ghost_Icon with the Empty_State line, and an orange primary button.
2. WHILE the Haunted_Class is present, THE Results_Page for a result that is not an Emergency_Result SHALL show the Haunted_Palette, every card heading in the Display_Font, one Cobweb in each card, the Ghost_Trade_Label in the trade chip, and the Haunted_Art in the page layout.
3. WHILE the Haunted_Class is present, THE Status_Panel SHALL show the reply box, the Time_Slot picker and the booking confirmation in the Haunted_Palette, with the Plain_Content wording unchanged character for character.
4. WHILE the Haunted_Class is present, THE Pro_Pages SHALL show the same Haunted_Switch and the Haunted_Palette on the access code form, the job list, the job page and each action form (accept, decline, ask a question).
5. WHILE the Haunted_Class is present, THE Haunted_Theme SHALL fit a viewport 390 px wide on the Home_Page, the Results_Page and the Pro_Pages with no horizontal scrolling, meaning the document scroll width is at most 390 px.
6. WHILE the Haunted_Class is absent, THE Home_Page, the Results_Page and the Pro_Pages SHALL show the Normal_Theme with every control and message that they show in the Haunted_Theme, so that the set of controls and the wording of messages are identical in both themes.
7. IF the Results_Page shows an Emergency_Result while the Haunted_Class is present, THEN THE Results_Page SHALL show the emergency message and the absence of do-it-yourself steps exactly as in the Normal_Theme, with the Haunted_Theme changing no wording, urgency value or visibility of any safety content.

### Requirement 15: Accessibility of the theme

**User Story:** As a User of assistive technology, I want the theme to work with a keyboard and a screen reader, so that decoration never gets in the way.

#### Acceptance Criteria

1. THE App SHALL give every interactive element in the Haunted_Theme a non-empty accessible name and a `focus-visible:` focus indicator with a Contrast_Ratio of at least 3:1 against the adjacent background, and SHALL make each interactive element reachable and operable with the keyboard alone.
2. THE App SHALL hide each purely decorative Haunted_Art element from assistive technology, so that it adds zero entries to the accessibility tree.
3. THE App SHALL give each Ghost_Icon that carries meaning a text alternative of 1 to 100 characters that states the meaning the icon conveys.
4. THE App SHALL keep the DOM reading order and the heading levels of each page identical in the Normal theme and the Haunted_Theme.
5. THE App SHALL convey every item of information (including urgency, emergency status, and confidence level) by text in addition to any Haunted_Art or colour, so that the information remains available when the art and colour are removed.
6. WHILE the Reduced_Motion_Setting is on, THE Haunted_Theme SHALL play no animation or auto-moving effect, and every feature available with motion SHALL remain usable.
7. WHEN the User switches the theme with the toggle, THE App SHALL keep keyboard focus on the toggle, and SHALL announce the newly selected theme to assistive technology through the toggle's accessible name or state.

### Requirement 16: Code and test constraints

**User Story:** As a developer, I want the theme added without weakening safety rules or tests, so that the App stays safe and maintainable.

#### Acceptance Criteria

1. THE App SHALL NOT modify the text content of `src/lib/jobs/copy.ts`, the text of `EMERGENCY_MESSAGE` or `PRO_EMERGENCY_NOTE`, or any file in `src/lib/safety/`, so that a byte-for-byte comparison of those files and strings against the pre-feature commit shows zero differences.
2. THE App SHALL NOT add, remove or change any entry in the `dependencies` or `devDependencies` fields of `package.json`, so that a comparison against the pre-feature commit shows zero differences in those fields.
3. WHEN the Vitest suite runs, THE Source_Scan_Test SHALL pass with its rules, its self-tests and its checks unchanged from the pre-feature commit, and every file this feature adds or changes in the scanned directories SHALL meet those rules.
4. WHERE the feature adds a new component to a scanned directory, THE Source_Scan_Test file list MAY be extended to include that component, and no other change to the Source_Scan_Test SHALL be made.
8. THE App MAY remove `transition-*` classes from `DropZone` and `UploadProgress` and MAY replace raw palette colour classes with tokens, provided every Normal_Theme colour keeps its computed value except the form-field border change in Requirement 3, criterion 5.
5. WHEN the UrgencyBadge test runs, THE UrgencyBadge test SHALL assert that the rendered output includes `haunted:` variants for each of the urgent, soon and monitor urgency levels, and SHALL assert that the rendered output includes no `haunted:` variants for the emergency urgency level.
6. THE App SHALL read every Haunted colour value from the Haunted_Palette tokens or CSS variables, with zero literal colour values (hex, `rgb()`, `hsl()`) in Haunted-themed component files, and SHALL read Haunted_Motion definitions only from the Motion_Stylesheet, with zero motion definitions (keyframes, transitions or animations) for the Haunted theme declared elsewhere.
7. WHEN `next lint`, `tsc --noEmit` and the Vitest suite (run in single-run mode) are each executed on the feature branch, THE App SHALL complete each with exit code 0, zero lint errors, zero type errors and zero failing or skipped-by-this-feature tests.

### Requirement 17: Property-based and example tests

**User Story:** As a developer, I want automated tests for the safety and accessibility promises of the theme, so that a later change cannot break them unnoticed.

#### Acceptance Criteria

1. THE test suite SHALL include a fast-check property test, run with at least 100 generated cases, asserting that every non-blank Trade_Text maps to a Ghost_Trade_Label equal to "<Ghost_Name> (<Trade_Display_Text>)", which contains the real trade as a case-insensitive substring, as stated in Requirement 6, criterion 12.
2. THE test suite SHALL include a fast-check property test, run with at least 100 generated cases, asserting that calling Trade_Mapper twice with the same input returns equal output, and that each Trade_Category maps to its defined Ghost_Name, including "Restless spirit" for an unknown trade.
3. THE test suite SHALL include a fast-check property test, run with at least 100 generated cases, asserting that an Emergency_Result leaves the root element without the Haunted_Class, shows no Haunted_Art and no Ghost_Name, and gives the Fixed_Emergency_Elements no `haunted:` class token, in each of these cases: the Haunted theme is selected, the Homeowner has replied, and the Pro Emergency_Page is shown, as stated in Requirement 11, criterion 9 and Requirement 12, criterion 8.
4. THE test suite SHALL include a fast-check property test, run with at least 100 generated cases, asserting that every Colour_Pair in the Contrast_Registry meets the minimum Contrast_Ratio defined for its role.
5. THE test suite SHALL include a fast-check property test, run with at least 100 generated cases, asserting that writing any valid Theme_Setting and then reading it returns the same value, as stated in Requirement 2, criterion 6.
6. THE test suite SHALL include example tests asserting that every animation in the Motion_Stylesheet has a cycle duration of at least 2 seconds, that the Motion_Stylesheet sets `animation: none` under the Reduced_Motion_Setting, and that no other CSS file or class in `src` defines or references an animation.
7. THE test suite SHALL include example tests asserting that the Haunted_Switch has the role `switch`, that pressing the Space key and the Enter key toggles it, that it is off on first load, that it keeps its state after a page reload, and that it is hidden (absent from the DOM or the accessibility tree and not focusable) on an Emergency_Page.
8. THE test suite SHALL include an example test asserting that `src` contains no `audio` element, no `autoPlay` attribute, and no use of the Web Audio API.
9. THE test suite SHALL include an example test asserting that each text string in `src/lib/jobs/copy.ts`, `EMERGENCY_MESSAGE` and `PRO_EMERGENCY_NOTE` equals its expected string, character for character.
10. IF any test described in this requirement fails, THEN THE test suite SHALL report a failing result that names the failing test, and THE test run SHALL exit with a non-zero status.
11. WHEN a fast-check property test fails, THE test suite SHALL report the shrunk counterexample and the seed that reproduces the failure.
12. THE test suite SHALL include example tests asserting that each of the Emergency_Banner, the Emergency_Badge and the Pro_Emergency_Note, rendered with the Haunted_Class on the root element, still shows its fixed classes and no `haunted:` class token.
13. THE test suite SHALL include an example test asserting that, after the User leaves an Emergency_Page (for example with "Start a new inspection") while the Theme_Setting is `haunted`, the Haunted_Class is on the root element again, the Theme_Setting is still `haunted`, and the Haunted_Switch is shown in its on state.
14. THE test suite SHALL include example tests asserting the Upload_Analysis_State lines ("Inspecting your home…" and "The inspector is walking the halls…") and the Home_Page Empty_State lines ("No photos or video added yet." and "No spirits caught yet."), with the plain line present whenever the haunted line is present.
15. THE test suite SHALL include example tests asserting that the Trade_Mapper gives "Poltergeist (Plumber)" for "plumber" and "Restless spirit (Chimney sweep)" for "chimney sweep", and that a blank Trade_Text shows no Ghost_Trade_Label.
16. THE test suite SHALL include example tests asserting that the Display_Font file and the Font_Licence_File sit in the same directory, that `package.json` dependencies are unchanged, and that the `flicker` animation with a 0.15 s period is gone.
