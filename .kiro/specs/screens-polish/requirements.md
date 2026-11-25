# Requirements Document

## Introduction

The screens-polish feature makes the live App look like the eight mockups in `docs/design/` (screens 1 to 8), on a phone (390 px wide) and on a desktop (1280 px and wider). Each mockup is a `.dc.html` file with inline styles. The App copies the spacing, sizes, colours, corner radii, wording and order of the mockups, except where Requirement 12 lists a deliberate difference. Where a later spec already decided something, the later spec wins over the mockup.

The feature changes how screens look and how sections are arranged. It also adds a few interactive touches (a job tracker, an urgency meter, filter chips, a copy-link button, dropdowns on Step 2 and a live summary on desktop) and one small safety addition: the App saves and shows which emergency rule fired (Requirement 18).

The mockups map to screens as follows (from `docs/design/README.md`): Main = home (screen 1), Result = normal result (2), Emergency = emergency result (3), Booking = pick a time (4), ProJobs = Pro job list (5), ProJob = Pro job page (6), HauntedHome (7) and HauntedResult (8) = Haunted mode.

Safety comes first. The fixed `EMERGENCY_MESSAGE`, the emergency rules of `safety.md`, `src/lib/safety/` and `src/components/sourceScan.test.ts` are not changed. Emergency pages are never themed and show no do-it-yourself steps.

### Delivery constraints

- The later tasks phase orders the parent tasks as: (1) tokens and fonts, (2) header and footer, (3) emergency reason, (4) home (with the Step 2 dropdowns and the desktop columns), (5) result (with the desktop columns), (6) booking and tracker, (7) Pro list, (8) Pro job page, (9) Haunted check, (10) final checkpoint.
- Each parent task leaves the App working: `next lint`, `tsc --noEmit` and `vitest --run` pass at the end of each parent task.
- No code is written in the requirements and design phases.
- The Step 2 dropdown change (Requirement 16) changes the `guided-intake` spec. The update of the guided-intake requirements, design and tasks documents is listed as work in this spec's tasks. This requirements document does not rewrite any other spec.
- Any change to a response shape or a stored attribute that an earlier spec fixed (Requirement 18) is listed in the design, and the tasks update the affected existing tests on purpose, with each change named.
- The user supplies the Inter font files `Inter-Variable.ttf` and `OFL.txt` in `src/assets/fonts/inter/`. No new npm package is added.
- `src/lib/safety/` stays unchanged. The emergency rule code comes from a thin wrapper outside `src/lib/safety/` (Requirement 18), which changes no decision.

### Existing code and specs this feature touches

| Area | Current state |
|---|---|
| `src/app/layout.tsx`, `src/app/fonts.ts`, `src/app/globals.css`, `src/app/haunted-motion.css` | Root layout, the Creepster Display_Font, global styles and the one Motion_Stylesheet |
| `src/components/ui/styles.ts` and `src/components/ui/normalBaseline.test.ts` | Shared Normal-theme class strings and the test that locks the Normal-theme colour classes per file |
| `src/lib/haunted/contrastRegistry.ts` | The Contrast_Registry, with its property test and the chat and help row tests |
| `src/lib/emergency/messages.ts` | `EMERGENCY_MESSAGE`, `PRO_EMERGENCY_NOTE`, `EMERGENCY_LIKELY_ISSUE`; unchanged by this feature |
| `src/lib/safety/safetyLayer.ts` | `checkEmergency` returns `{ isEmergency, triggeredCondition }` with the codes `GAS_SMELL`, `ELECTRICAL_FIRE`, `WATER_ELECTRICAL`, `CO_ALARM`; unchanged by this feature |
| `src/components/pro/PhotoGallery.tsx`, `PhotoViewer.tsx` | The in-page photo viewer for the Pro job page |
| `src/components/ui/chat/ChatPanel.tsx` | The chat (spec `chat-and-help`) |
| `src/components/intake/` | The guided intake flow (spec `guided-intake`) |
| `src/lib/safety/replyCheck.ts` | `replyTriggersEmergency(text)`, the check that the routes use to decide whether a reply or a chat message is an emergency; unchanged by this feature |
| `.kiro/specs/guided-intake`, `haunted-mode`, `pro-dashboard-and-booking`, `chat-and-help`, `intake-and-triage` | The specs this feature must agree with |

### Assumptions

- "Spec 2" is `intake-and-triage`, "spec 3" is `haunted-mode`, "spec 4" is `chat-and-help` and "spec 5" is `guided-intake`. "Spec 2" and "spec 3" emergency rules are the ones in those documents.
- The Haunted_Switch stays hidden on an Emergency_Page, as `haunted-mode` requires. The header on an Emergency_Page therefore shows the title only (and, on Pro pages, the PRO tag).
- The "PRO" tag shows on every `/pro` page. "Log out" shows only on `/pro` pages that are shown to a signed-in Pro_User, not on the access code form.
- The cost text keeps the existing `CostRange` format (`CA$180 – CA$350`, with spaces around the en dash) required by `pro-dashboard-and-booking` Requirement 5, criterion 5. The mockups draw it without spaces. Only the size and weight follow the mockups.
- The mockups show Inter loaded from Google Fonts. The App loads Inter only from the repository, as `haunted-mode` Requirement 9 does for Creepster. The user has added one variable font file, `Inter-Variable.ttf`, and `OFL.txt` to `src/assets/fonts/inter/`. The App uses that one file for the weight range 400 to 700 and adds no static weight files.
- The Haunted_Switch stays hidden on an Emergency_Page, "Log out" shows only to a signed-in Pro_User, and declined jobs show only under "All". These three decisions are confirmed.
- The mockup home screen is one page. The App keeps the three guided steps of spec 5 and applies the mockup look to each step.
- Declined jobs are not a filter chip on the Pro job list. They show under "All".

### Out of scope

- Any change to `src/lib/safety/`, `EMERGENCY_MESSAGE`, `sourceScan.test.ts`, the Bedrock prompt, the rate limits or the access rules.
- New pages, accounts, email, payments or real calendars.
- New animation outside the Motion_Stylesheet.
- Rewriting the other specs' documents beyond the guided-intake update named in Requirement 16.

## Glossary

- **App**: The Haunted House Inspector Next.js web application.
- **Homeowner**: A person who uses the Home_Page and the Results_Page.
- **Pro_User**: A tradesperson who uses the Pro_Pages with a valid Pro_Cookie.
- **Home_Page**: The page `/`, showing the Guided_Intake.
- **Results_Page**: The page `/inspect/[id]`.
- **Pro_Pages**: The pages `/pro` (access code form and job list) and `/pro/jobs/[id]`.
- **Pro_Job_List**: The job list on `/pro`.
- **Pro_Job_Page**: The page `/pro/jobs/[id]`.
- **Screen_Mockups**: The eight files `Main`, `Result`, `Emergency`, `Booking`, `ProJobs`, `ProJob`, `HauntedHome` and `HauntedResult` (`.dc.html`) in `docs/design/`.
- **Phone_Layout**: The layout at viewport widths below 1024 px, tested at 390 px.
- **Desktop_Layout**: The layout at viewport widths of 1024 px and wider, tested at 1024 px, 1280 px and 1920 px.
- **Normal_Theme**: The default light theme, shown while the root element does not have the Haunted_Class.
- **Haunted_Theme**: The theme shown while the root element has the class `theme-haunted` (the Haunted_Class).
- **Haunted_Switch**: The ARIA `role="switch"` control labelled "Haunted mode".
- **Theme_Tokens**: The named colour, font and radius values of the App's design system, defined once in the place where the App defines its theme today.
- **Normal_Palette**: Page background `#F6F7F9`; card background `#FFFFFF` with a 1 px `#D9DEE5` border and 14 px corners; text `#18212B`; muted text `#55606E`; accent `#1F5FA8` (hover `#174A84`); emergency `#B42318`.
- **Body_Font**: Inter, self-hosted with `next/font/local` from the one variable file `src/assets/fonts/inter/Inter-Variable.ttf` (weight range 400 to 700), used for all text in both themes except the Haunted headings.
- **Font_Licence_File**: The file `OFL.txt` committed in `src/assets/fonts/inter/`.
- **Display_Font**: Creepster, as defined in `haunted-mode`.
- **Site_Header**: The header shown on every page.
- **Site_Footer**: The footer shown on every page.
- **Weekly_Reset_Link**: The footer text "A Weekly Reset product", linking to `https://www.weeklyresetwr.com`.
- **Emergency_Page**: Any view of an Emergency_Result, as defined in `haunted-mode`: the Results_Page for an emergency job, the Results_Page after a reply, chat message or booking returns the emergency outcome, and the Pro_Job_Page for an emergency job.
- **Emergency_Banner**: The existing `EmergencyBanner` component, which shows `EMERGENCY_MESSAGE`.
- **Emergency_Message**: The exact text in `EMERGENCY_MESSAGE` from `src/lib/emergency/messages.ts`.
- **Pro_Emergency_Note**: The exact text in `PRO_EMERGENCY_NOTE` from `src/lib/emergency/messages.ts`.
- **Emergency_Rule**: One of the four codes `GAS_SMELL`, `ELECTRICAL_FIRE`, `WATER_ELECTRICAL`, `CO_ALARM` that `checkEmergency` returns as `triggeredCondition`.
- **Emergency_Source**: Where an emergency came from. The only values are `precheck` (the check before the AI), `postcheck` (the check on the AI's answer) and `override` (a chat message or a reply that turned an existing job into an emergency). A booking request carries no Homeowner text, so it never creates an emergency and never sets an Emergency_Source; it only returns an existing emergency (HTTP 409).
- **Emergency_Rule_Wrapper**: The thin module outside `src/lib/safety/` (in `src/lib/emergency/`) that supplies the Emergency_Rule for a text. It calls the unchanged safety code and decides nothing itself.
- **Emergency_Reason_Sentence**: The one fixed sentence that belongs to an Emergency_Rule (Requirement 18).
- **Emergency_Reasons_File**: The one new constants file in `src/lib/emergency/` that holds the four Emergency_Reason_Sentences.
- **Urgency**: One of `monitor`, `soon`, `urgent`, `emergency`, shown as the labels Monitor, Soon, Urgent and Emergency.
- **Urgency_Badge**: The existing `UrgencyBadge` component.
- **Urgency_Meter**: The 4-step meter (Monitor, Soon, Urgent, Emergency) that carries the Urgency_Badge on the Results_Page.
- **Job_Status**: One of `new`, `info_requested`, `accepted`, `declined`, `booked`, `emergency`, as defined in `pro-dashboard-and-booking`.
- **Status_Panel**: The Results_Page component of `pro-dashboard-and-booking` that polls the status every 30 seconds, shows the status text and the Refresh button, the offered time slots and the booking confirmation.
- **Job_Tracker**: The Results_Page element that shows the four steps Result, Tradesperson reviewing, Pick a time and Booked, the status text, "Updates every 30 seconds." and the Refresh button (Requirement 6).
- **Tracker_End_State**: The Job_Tracker view for a declined job (Requirement 6).
- **Chat_Panel**: The chat component of `chat-and-help`.
- **Help_Section**: The "Need help? Contact us" section of `chat-and-help`.
- **Results_Page_Notice**: The line "Anyone with this page's link can see it and send messages in the chat. Your photos and messages are deleted after 30 days." (`chat-and-help` Requirement 9, criterion 8).
- **Copy_Link_Button**: The button "Copy link to this page" placed beside the Results_Page_Notice.
- **Copy_Fallback_Box**: A read-only text box that shows the page address, selected, when copying fails (the same pattern as the "Copy job brief" button).
- **Guided_Intake**: The three-step flow of `guided-intake` on the Home_Page.
- **Step**: One of Step 1 "Safety check and photos", Step 2 "A few quick questions", Step 3 "Review and send".
- **Intake_State**: All Homeowner input held by the Guided_Intake, as defined in `guided-intake`.
- **Answer_Strings**: The three strings `location`, `duration` and `recentChanges` that the Guided_Intake sends to `POST /api/inspect`.
- **Location_Select**: The native `<select>` "Where is the problem?" on Step 2.
- **Duration_Select**: The native `<select>` "How long has this been going on?" on Step 2.
- **Inspection_Panel**: The Desktop_Layout card titled "Your inspection" on the Home_Page, with the step list and the Live_Summary.
- **Step_List**: The three steps listed top to bottom inside the Inspection_Panel.
- **Live_Summary**: The part of the Inspection_Panel that shows the current Intake_State as text and thumbnails.
- **Review_Text**: The text the Step 3 review produces for the safety answers, location, duration and anything else.
- **Sticky_Panel**: A Desktop_Layout panel that stays in view while the page scrolls, only when the window is tall enough to show the whole panel (Requirement 17, criterion 9).
- **Layout_Definition**: A typed list per screen and per layout (Phone_Layout and Desktop_Layout) that names the sections in order and the column each belongs to.
- **Booking_Card**: One offered time slot drawn as a large selectable card on the Results_Page.
- **Filter_Chip**: One of the chips All, New, Waiting for reply, Accepted, Booked and Emergency on the Pro_Job_List.
- **Status_Pill**: The pill "Status: <status label>" on the Pro_Job_Page.
- **Respond_Panel**: The "Respond to this job" card on the Pro_Job_Page.
- **Contrast_Registry**: The typed list of colour pairs and their contrast ratios in `src/lib/haunted/contrastRegistry.ts`.
- **Normal_Baseline_Test**: The test `src/components/ui/normalBaseline.test.ts`.
- **Source_Scan_Test**: The existing test `src/components/sourceScan.test.ts`.
- **Motion_Stylesheet**: The one CSS file `src/app/haunted-motion.css` that holds every Haunted motion rule.
- **Reduced_Motion_Setting**: The browser setting that matches `prefers-reduced-motion: reduce`.
- **Ghost_Trade_Label**: The label "<Ghost_Name> (<Trade_Display_Text>)", as defined in `haunted-mode`.
- **Haunted_Art**: The Header_Silhouette, Cobweb, Fog_Layer and Ghost_Icon of `haunted-mode`.
- **Pro_Cookie**: The signed `hhi_pro` cookie of `pro-dashboard-and-booking`.

## Requirements

### Requirement 1: Normal theme look, tokens and Inter

**User Story:** As a Homeowner or Pro_User, I want the App to use the same clean look as the design, so that every screen looks like one product.

#### Acceptance Criteria

1. THE App SHALL define the Normal_Palette (page background `#F6F7F9`, card background `#FFFFFF`, card border `#D9DEE5`, text `#18212B`, muted text `#55606E`, accent `#1F5FA8`, accent hover `#174A84`, emergency `#B42318`) as Theme_Tokens, and the card radius of 14 px as a Theme_Token.
2. WHILE the Normal_Theme is on, THE App SHALL draw the page background, cards, text, muted text, links, primary buttons and focus rings from the Theme_Tokens of criterion 1, so that a computed-style check on each shows the colour listed in criterion 1.
3. THE App SHALL load the Body_Font with `next/font/local` from the single variable file `Inter-Variable.ttf` in `src/assets/fonts/inter/` declared with the weight range 400 to 700, and SHALL apply it to all text through one font variable, so that the weights 400, 500, 600 and 700 all come from that one file.
4. THE repository SHALL contain the Font_Licence_File in `src/assets/fonts/inter/`, next to `Inter-Variable.ttf`.
5. THE App SHALL NOT load any font from a third-party host at run time.
6. WHILE the Body_Font is loading, THE App SHALL show text in the fallback stack `system-ui, sans-serif`, so that text is visible within 100 ms of first paint.
7. WHILE the Haunted_Theme is on, THE App SHALL keep the `haunted.*` palette of `haunted-mode` unchanged, SHALL use the Body_Font for body text, and SHALL keep the Display_Font for headings only.
8. THE Normal_Theme Theme_Tokens SHALL appear once, and THE component files SHALL use them through classes, so that the Source_Scan_Test finds no hex or rgb colour in any component file.
9. WHEN the Theme_Tokens change, THE Normal_Baseline_Test SHALL be updated on purpose in the same task, and each added, removed or renamed class SHALL be listed in a comment at the top of that test, per file.

### Requirement 2: Header and footer on every page

**User Story:** As a User, I want the same header and footer on every page, so that I always know where I am and how to switch the theme.

#### Acceptance Criteria

1. THE Site_Header SHALL show the text "Haunted House Inspector" and the Haunted_Switch on every page that is not an Emergency_Page, in the Phone_Layout and the Desktop_Layout.
2. WHILE a view is an Emergency_Page, THE Site_Header SHALL show the text "Haunted House Inspector" and SHALL NOT show the Haunted_Switch, as `haunted-mode` requires.
3. WHILE the page is a Pro_Page, THE Site_Header SHALL also show a tag with the text "PRO".
4. WHILE the page is a Pro_Page shown to a signed-in Pro_User, THE Site_Header SHALL show a "Log out" button, and THE Pro_Pages SHALL NOT show a second "Log out" button in the page body.
5. WHEN the Pro_User activates "Log out", THE Site_Header SHALL call the existing logout route and then show the access code form, as the existing log-out behaviour does.
6. WHILE the page is the `/pro` access code form, THE Site_Header SHALL show the "PRO" tag and SHALL NOT show "Log out".
7. THE Site_Footer SHALL show the text "Estimates only. Not a professional inspection." and the Weekly_Reset_Link on every page, including every Emergency_Page.
8. THE Weekly_Reset_Link SHALL link to `https://www.weeklyresetwr.com` and SHALL carry `rel="noopener noreferrer"`.
9. THE Site_Header SHALL provide a "Skip to main content" link as its first focusable element, and the page SHALL have one `main` element with the matching id.
10. THE Site_Header and the Site_Footer SHALL follow the spacing, sizes and wording of the Screen_Mockups at 390 px and, on the Pro_Pages, keep the header content inside a centred column of at most 1120 px.
11. THE Haunted_Switch SHALL have a touch target of at least 44 px high, and SHALL keep the accessible name and state behaviour of `haunted-mode`.

### Requirement 3: Home page (screen 1)

**User Story:** As a Homeowner, I want a clear home screen with my photos, my answers and the privacy notice, so that I can send my problem with confidence.

#### Acceptance Criteria

1. THE Home_Page SHALL show the `h1` "Upload a photo or video of your problem." with the line "Add up to 5 photos, or one video up to 30 seconds." directly below it.
2. THE Home_Page SHALL keep the three Steps of the Guided_Intake and SHALL apply the look of the home Screen_Mockup to each Step.
3. WHILE at least one photo is selected, THE Guided_Intake SHALL show on Step 1 a card with the heading "Your photos" and the count "<n> of 5 photos", where n is the number of selected photos.
4. WHILE a video is selected, THE Guided_Intake SHALL show the count "1 video" in place of the photo count.
5. WHILE files are selected, THE "Your photos" card SHALL show one row per file with a 56 px thumbnail (an icon for a video), the file name, the file size in MB with one decimal place, and a "Remove" button of at least 44 px high.
6. WHILE files are selected, THE "Your photos" card SHALL show a dashed drop area with the text "Drag more photos here, or" and a button "Add more photos".
7. WHILE no file is selected, THE "Your photos" card SHALL keep the existing empty drop area and the Sample_Button of spec 5.
8. THE "Your photos" card SHALL show the text "JPEG, PNG or WebP, up to 10 MB each" and, while files are selected, a "Clear selection" button.
9. WHEN the Homeowner activates "Remove", THE Guided_Intake SHALL remove that file only, and WHEN the Homeowner activates "Clear selection", THE Guided_Intake SHALL remove all files, and each action SHALL keep every answer and every Safety_Chip selection.
10. THE Guided_Intake SHALL show on Step 3 the "Before you send" card with a lock icon, the heading "Before you send" and the existing `DataRetentionNotice` text of spec 4, in the notice style of the Screen_Mockup (background `#EEF4FB`, border `#C9DAEE`).
11. THE Guided_Intake SHALL show on Step 3 a full-width button "Inspect my home" that is 54 px high with 12 px corners.
12. THE Guided_Intake SHALL keep every behaviour of `guided-intake` that this requirement and Requirements 16 and 17 do not change, including the safety chips at the top of Step 1, the Live_Emergency_Notice, the progress stages and the answer mapping.
13. THE Home_Page SHALL show no horizontal scroll bar at viewport widths from 320 px to 1920 px.

### Requirement 4: Results page (screen 2)

**User Story:** As a Homeowner, I want a scannable result page, so that I can see who to call, how urgent it is and what it may cost.

#### Acceptance Criteria

1. THE Results_Page SHALL show its sections for a non-emergency job in this order in the Phone_Layout, from the top: the "Start a new inspection" link with a back arrow; the Urgency_Meter; the likely issue as the page `h1`; the line "This is a likely diagnosis, not a certain one."; the "Who to call" and "AI confidence in this diagnosis" card; the "Likely cost" card; the "Job brief for the tradesperson" card with the "Copy job brief" button; the "Questions a tradesperson may ask" card; the "Safe things you can do now" card; the Chat_Panel; the Job_Tracker; the booking section; the Results_Page_Notice with the Copy_Link_Button beside it; and the Help_Section.
2. THE "Who to call" and "AI confidence in this diagnosis" card SHALL show the two values side by side at 390 px, and SHALL show a confidence bar that fills in proportion to the confidence percentage, next to the "~<n>%" text.
3. THE "Likely cost" card SHALL show the cost range in large text (28 px, weight 700) in the existing `CostRange` text format, and the text "rough range, not a quote" directly below it.
4. THE Results_Page SHALL show the confidence level as text and SHALL NOT present the diagnosis as certain.
5. WHEN the Homeowner activates the Copy_Link_Button, THE Results_Page SHALL copy the address of the current page to the clipboard and SHALL show the text "Link copied" in an element with `aria-live="polite"` for at least 2 seconds.
6. IF copying the page address fails, THEN THE Results_Page SHALL show the Copy_Fallback_Box with the page address selected, so that the Homeowner can copy it by hand, and SHALL show no "Link copied" text.
7. THE Copy_Link_Button SHALL be at least 44 px high and SHALL have the accessible name "Copy link to this page".
8. THE Results_Page SHALL show the Results_Page_Notice with exactly the text of `chat-and-help` Requirement 9, criterion 8, and the Copy_Link_Button beside it, and SHALL keep the "Start a new inspection" link above the Help_Section as `chat-and-help` Requirement 10 requires.
9. WHILE a view is an Emergency_Page, THE Results_Page SHALL render no Copy_Link_Button, no Results_Page_Notice, no Job_Tracker, no Urgency_Meter, no Chat_Panel and no Help_Section.
10. THE Results_Page SHALL show the "Copy job brief" button at least 44 px high, and WHEN activated, SHALL copy the job brief text, show a confirmation, and show a Copy_Fallback_Box when copying fails, as it does today.
11. THE Results_Page SHALL keep every existing safety text: "rough range, not a quote", the confidence level, and no do-it-yourself steps for gas or electrical work.
12. THE Results_Page SHALL follow the spacing, sizes, colours, corner radii and wording of the Result Screen_Mockup at 390 px, except where Requirement 12 lists a difference.

### Requirement 5: Emergency page (screen 3)

**User Story:** As a Homeowner in danger, I want a plain page that tells me to get to safety, so that nothing else distracts me.

#### Acceptance Criteria

1. WHILE a view is an Emergency_Page for the Homeowner, THE Results_Page SHALL show, from the top inside `main`: the Emergency_Banner with the Emergency_Message; the Emergency_Reason_Sentence directly under the Emergency_Banner when one exists (Requirement 18); the Emergency badge; the title "Possible emergency" as the `h1`; and the "Start a new inspection" link.
2. WHILE a view is an Emergency_Page, THE Results_Page SHALL show no other content inside `main`: no cost, no trade, no job brief, no questions, no do-it-yourself steps, no chat, no booking and no help form.
3. THE Emergency_Banner SHALL keep its fixed style (`#B42318` background, white text, 16 px corners, 19 px semi-bold text, an alert role and a warning icon), and SHALL carry no `haunted:` class.
4. WHILE the Haunted_Theme is on and a view is an Emergency_Page, THE Results_Page SHALL show the Normal_Theme, as `haunted-mode` Requirement 12 requires.
5. THE Emergency_Page SHALL use one column at every viewport width, with no side panel and no Sticky_Panel.
6. THE Emergency_Page SHALL show the Site_Header (without the Haunted_Switch) and the Site_Footer of Requirement 2.
7. WHEN the Homeowner activates "Start a new inspection" on an Emergency_Page, THE App SHALL go to the Home_Page.

### Requirement 6: Job tracker on the result page

**User Story:** As a Homeowner, I want to see where my job is in the process, so that I know what happens next.

#### Acceptance Criteria

1. THE Job_Tracker SHALL show four steps in this order: "Result", "Tradesperson reviewing", "Pick a time" and "Booked".
2. THE Job_Tracker SHALL mark the current step with both a visible mark and the text "Current step" (or `aria-current="step"` with a visible mark), and SHALL mark each earlier step as done with a visible mark, so that the state does not depend on colour alone.
3. WHILE the Job_Status is `new` or `info_requested`, THE Job_Tracker SHALL mark "Result" as done and "Tradesperson reviewing" as current.
4. WHILE the Job_Status is `accepted`, THE Job_Tracker SHALL mark "Result" and "Tradesperson reviewing" as done and "Pick a time" as current.
5. WHILE the Job_Status is `booked`, THE Job_Tracker SHALL mark "Result", "Tradesperson reviewing" and "Pick a time" as done and "Booked" as current.
6. WHILE the Job_Status is `declined`, THE Job_Tracker SHALL show the Tracker_End_State in place of the four steps: the text "This tradesperson can't take your job right now", the decline reason when one exists, and the Status_Safety_Line of `pro-dashboard-and-booking`.
7. THE Job_Tracker SHALL show the existing status text for the Job_Status (`pro-dashboard-and-booking` Requirement 8, criterion 3) in an element with `role="status"`, the text "Updates every 30 seconds." and a "Refresh" button at least 44 px high.
8. THE Job_Tracker SHALL use the Status_Panel's existing polling, Refresh and error behaviour, so that the 30-second interval, the single request in flight, the pause while the tab is hidden and the stop on a terminal status stay as `pro-dashboard-and-booking` Requirement 8 defines them.
9. WHEN a status response changes the Job_Status, THE Job_Tracker SHALL show the new current step and the new status text in the same update.
10. WHILE a view is an Emergency_Page, THE Results_Page SHALL render no Job_Tracker and send no status request.
11. THE Job_Tracker SHALL map every Job_Status other than `emergency` to exactly one view (a current step, or the Tracker_End_State) through one pure function, so that the mapping is testable without rendering.

### Requirement 7: Urgency meter

**User Story:** As a Homeowner, I want to see how urgent my problem is at a glance, so that I know how fast to act.

#### Acceptance Criteria

1. THE Urgency_Meter SHALL show four steps in this order: "Monitor", "Soon", "Urgent" and "Emergency", with the Urgency_Badge of the current Urgency on the meter.
2. THE Urgency_Meter SHALL show the text label of the current Urgency at all times, so that the Urgency is never conveyed by colour alone.
3. THE Urgency_Meter SHALL mark the current step with a visible mark in addition to its colour, and SHALL expose the current step to assistive technology (for example through `aria-current` on a list item).
4. THE Urgency_Meter SHALL use the Urgency_Badge colours of the Screen_Mockups: Soon `#FEF0C7` on `#7A4F01`, Urgent `#FCE3D3` on `#9A3412`, Monitor `#DCF5E6` on `#14532D` and Emergency `#B42318` on `#FFFFFF`, as Theme_Tokens.
5. THE Urgency_Meter SHALL appear on the Results_Page for Monitor, Soon and Urgent results only, and SHALL NOT appear on an Emergency_Page.
6. WHILE the Haunted_Theme is on, THE Urgency_Meter SHALL keep the wording and the Urgency_Badge colours of the Haunted_Theme defined by `haunted-mode`, and SHALL keep the text label visible.
7. FOR ALL Urgency values of Monitor, Soon and Urgent, THE Urgency_Meter SHALL mark exactly one step as current, and that step SHALL be the one with the same label as the Urgency (property).

### Requirement 8: Booking section (screen 4)

**User Story:** As a Homeowner, I want to pick one of the offered times with large, clear buttons, so that booking is easy on a phone.

#### Acceptance Criteria

1. WHILE the Job_Status is `accepted`, THE Results_Page SHALL show the heading text "A tradesperson can take your job. Pick a time that suits you." and the legend "Offered start times" above the Booking_Cards.
2. THE Results_Page SHALL show each offered time slot as a Booking_Card that is a radio choice with a 60 px minimum height, the day on one line and the time with its zone name on the next line, with the time in a `<time>` element whose `dateTime` holds the UTC value.
3. WHEN the Homeowner selects a Booking_Card, THE Results_Page SHALL mark it with a 2 px accent border and a visible mark in addition to the border colour.
4. WHILE no Booking_Card is selected, THE Results_Page SHALL show the "Confirm this time" button as disabled, and WHILE one is selected, SHALL enable it.
5. WHEN the Homeowner activates "Confirm this time", THE Results_Page SHALL send the booking through the existing booking route and SHALL apply the existing result handling of `pro-dashboard-and-booking`, including the emergency override.
6. WHILE the Job_Status is `booked`, THE Results_Page SHALL show the text "Your booking is confirmed. The tradesperson will arrive <day and time>." where the day and time are the booked slot, in a `<time>` element, followed by the Status_Safety_Line.
7. THE Results_Page SHALL place the booking section after the Job_Tracker, which follows the Chat_Panel, and SHALL keep the Results_Page_Notice, the Copy_Link_Button and the Help_Section after it, so that booking is the last job section before the Help_Section in the Phone_Layout.
8. THE Pro_Job_Page SHALL place the Respond_Panel (the booking controls of the Pro_User) after the Chat_Panel in the Phone_Layout, so that on both sides the booking controls are the last job section before the Help_Section.
9. WHILE the Job_Status is `new`, `info_requested`, `declined` or `emergency`, THE Results_Page SHALL show no Booking_Card and no "Confirm this time" button.
10. THE Results_Page SHALL show the offered slots in ascending order, as the existing Status_Panel does.

### Requirement 9: Pro job list (screen 5)

**User Story:** As a Pro_User, I want to scan and filter the newest jobs, so that I can pick the one to open.

#### Acceptance Criteria

1. THE Pro_Job_List SHALL show the `h1` "Jobs", the text "The newest 50 jobs from the last 30 days." and a "Refresh" button on the right, at least 44 px high.
2. THE Pro_Job_List SHALL keep the existing Refresh, loading, empty ("No jobs yet.") and error behaviour of `pro-dashboard-and-booking` Requirement 4.
3. THE Pro_Job_List SHALL show the Filter_Chips All, New, Waiting for reply, Accepted, Booked and Emergency, each with its count in the text, for example "New (3)".
4. THE Pro_Job_List SHALL count each Filter_Chip over the jobs currently loaded: All counts every loaded job, New counts Job_Status `new`, Waiting for reply counts `info_requested`, Accepted counts `accepted`, Booked counts `booked` and Emergency counts `emergency`.
5. THE Pro_Job_List SHALL start with the All chip selected, and WHEN the Pro_User activates a Filter_Chip, SHALL show only the jobs of that chip, without a new request.
6. THE Pro_Job_List SHALL expose the selected Filter_Chip with `aria-pressed="true"` and a visible mark in addition to colour, and each Filter_Chip SHALL be at least 44 px high.
7. WHEN a filter shows no job, THE Pro_Job_List SHALL show the text "No jobs match this filter."
8. WHEN the Pro_User activates Refresh, THE Pro_Job_List SHALL keep the selected Filter_Chip and update the counts from the new list.
9. WHILE the viewport is in the Desktop_Layout, THE Pro_Job_List SHALL show the jobs as a table inside a 14 px rounded white card, with the columns Urgency, Where in the home, Trade, Received and Status, and a header row on `#EEF1F5`.
10. THE Pro_Job_List table SHALL show each row as: the Urgency_Badge; the location as a link to `/pro/jobs/[id]` whose accessible name includes the location and the status label; the trade; the received time in a `<time>` element in the browser's time zone with the zone name; and the status label as text.
11. WHERE a job is an emergency job, THE Pro_Job_List SHALL show "—" in place of the trade, SHALL show the row on the `#FEF3F2` background, and SHALL show no action for that job.
12. THE Pro_Job_List SHALL show the note "Emergency jobs show no trade and no actions. The homeowner was told to call 911." below the list.
13. WHILE the viewport is in the Phone_Layout, THE Pro_Job_List SHALL show the same jobs, in the same order, as cards that carry the same facts and the same link as the table rows, with no horizontal scroll bar.
14. FOR ALL lists of jobs and each Filter_Chip, THE number shown in the chip SHALL equal the number of jobs that chip shows when selected, and the count of All SHALL equal the number of loaded jobs (property).

### Requirement 10: Pro job page (screen 6)

**User Story:** As a Pro_User, I want a job page that puts the facts on the left and my response on the right, so that I can decide quickly.

#### Acceptance Criteria

1. THE Pro_Job_Page SHALL show at its top: an "All jobs" link with a back arrow to `/pro`; the Urgency_Badge and the Status_Pill; the likely issue as the `h1`; and the text "Received <time>" with the time in a `<time>` element.
2. THE Status_Pill SHALL show the text "Status: " followed by the status label of `pro-dashboard-and-booking` Requirement 6, criterion 5.
3. THE Pro_Job_Page SHALL show the sections of a non-emergency job in this order in the Phone_Layout: Job brief with "Questions you may want to ask"; Photos (<n>); Homeowner's answers; the Chat_Panel; Trade, Likely cost and AI confidence; the Respond_Panel; then the Help_Section.
4. WHILE the viewport is in the Desktop_Layout, THE Pro_Job_Page SHALL show two columns: the left column holds Job brief, Photos, Homeowner's answers and the Chat_Panel; the right column holds Trade, Likely cost, AI confidence and the Respond_Panel, and is a Sticky_Panel.
5. THE Photos section SHALL show the heading "Photos (<n>)", a grid of thumbnails that open the existing in-page photo viewer, and the text "Photo links expire after 15 minutes. Refresh the page to see them again."
6. THE "Likely cost" block SHALL use the existing `CostRange` text format with the text "rough range, not a quote", and the "AI confidence in this diagnosis" block SHALL show the existing "~<n>%" format.
7. THE Respond_Panel SHALL have the heading "Respond to this job", and WHILE the Job_Status is `new` or `info_requested`, SHALL show the decline control first and the accept control last, with the legend "Accept and offer times", the labels "First time you can start", "Second time" and "Third time", and the button "Accept and offer these times".
8. THE Respond_Panel SHALL keep the decline reason field (optional, 200 characters, with a live count) and the "Decline job" button, and SHALL keep the existing accept validation, disabling, status and error behaviour of `pro-dashboard-and-booking` Requirement 7.
9. THE Respond_Panel SHALL show no "Ask the homeowner a question" form, because the Chat_Panel replaces it (`chat-and-help`).
10. WHILE the Job_Status is `accepted`, `booked` or `declined`, THE Respond_Panel SHALL show the existing offered slots, booked slot or decline reason in place of the forms.
11. WHILE the Job_Status is `emergency`, THE Pro_Job_Page SHALL show the Pro_Emergency_Note, the Emergency_Reason_Sentence directly under it when one exists (Requirement 18), the likely issue and the answers as read-only text, and SHALL show no Chat_Panel, no Respond_Panel, no photos, no cost, no trade, no Help_Section and no Sticky_Panel.
12. WHILE the viewport is in the Desktop_Layout, THE Pro_Job_Page SHALL centre its content in a column of at most 1120 px.
13. THE Pro_Job_Page SHALL keep the load, 404, 500 and "Try again" behaviour of `pro-dashboard-and-booking` Requirement 5.

### Requirement 11: Haunted mode look (screens 7 and 8)

**User Story:** As a Homeowner who likes the spooky theme, I want Haunted mode to look like the design, so that it feels finished and still easy to read.

#### Acceptance Criteria

1. WHILE the Haunted_Theme is on and the page is not an Emergency_Page, THE Site_Header SHALL show an illustrated band with the moon, the house and the trees behind the title, 170 px high on the Home_Page and 112 px high on the other pages in the Phone_Layout, with the title in the Display_Font.
2. WHILE the Haunted_Theme is on, THE Site_Header art SHALL be decorative (`aria-hidden`), SHALL NOT cover the title or the Haunted_Switch, and SHALL leave both readable at the contrast ratios of the Contrast_Registry.
3. WHILE the Haunted_Theme is on, THE App SHALL show a Cobweb in the top corner of its cards, as `haunted-mode` Requirement 5 defines.
4. WHILE the Haunted_Theme is on and no file is selected, THE Guided_Intake SHALL show the Ghost_Icon and the text "No spirits caught yet." in the empty photo box.
5. WHILE the Haunted_Theme is on, THE Results_Page SHALL show the Ghost_Trade_Label as a ghost tag above the result title, and the Ghost_Trade_Label SHALL contain the real trade, for example "Poltergeist (Plumber)".
6. WHILE the Haunted_Theme is on, THE App SHALL show the Fog_Layer along the bottom of the page behind the content, with no pointer events.
7. WHILE the Haunted_Theme is on, THE Urgency_Badge, the cost, the status texts, the error texts and the safety texts SHALL stay in plain words, as `haunted-mode` Requirement 8 requires.
8. WHILE a view is an Emergency_Page, THE App SHALL show no Haunted_Art, no Ghost_Trade_Label and no Haunted wording.
9. THE Haunted_Theme layout SHALL follow the same section order, the same columns and the same text as the Normal_Theme on every screen.

### Requirement 12: Deliberate differences from the mockups

**User Story:** As the owner of the App, I want the list of deliberate differences from the mockups written down, so that a reviewer knows what to follow when the mockup and the App disagree.

#### Acceptance Criteria

1. THE App SHALL show the real trade in every ghost label ("Poltergeist (Plumber)") and SHALL NOT show the ghost word alone, as in the HauntedResult mockup's "Poltergeist (Plumbing)".
2. THE App SHALL show the privacy notice text of spec 4: "Your photos, answers and messages are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days." in place of the mockup text.
3. THE App SHALL show the Chat_Panel in place of the mockup's "Questions and replies" section and "Ask the homeowner a question" form.
4. THE App SHALL show the Help_Section at the bottom of every page that is not an Emergency_Page.
5. THE App SHALL use the guided questions of spec 5 (as changed by Requirement 16) in place of the three text boxes of the home mockup.
6. THE Pro_Job_Page SHALL use the in-page photo viewer and real photos in place of the mockup's photo placeholders.
7. THE `/pro` access code screen, which no mockup draws, SHALL use the same card style, spacing and Normal_Palette as the other screens.
8. THE Emergency_Page SHALL show the "Start a new inspection" link, which the Emergency mockup omits.
9. THE Guided_Intake SHALL show the Step 2 dropdowns of Requirement 16.
10. THE Home_Page and the Results_Page SHALL use the Desktop_Layout columns of Requirement 17.
11. THE Emergency_Page SHALL show the Emergency_Reason_Sentence of Requirement 18.
12. WHERE a Screen_Mockup and one of criteria 1 to 11 disagree, THE App SHALL follow criteria 1 to 11.

### Requirement 13: Interactive touches and motion

**User Story:** As a User, I want the pages to respond when I use them, without fake waiting or distracting motion.

#### Acceptance Criteria

1. THE App SHALL show real progress only, and SHALL add no artificial delay and no minimum display time to any state.
2. THE App SHALL show a hover colour and a pressed colour on every button, link, chip, Booking_Card and Filter_Chip, drawn from the Theme_Tokens through `hover:` and `active:` classes.
3. THE App SHALL use no `animate-`, `transition` or `duration-` class in any component file, and SHALL define every motion rule only in the Motion_Stylesheet under `.theme-haunted`.
4. WHILE the Reduced_Motion_Setting is on, THE App SHALL show no animation, no transition and no smooth scrolling anywhere.
5. WHEN the Homeowner or Pro_User changes a choice (a chip, a dropdown, a Filter_Chip or a Booking_Card), THE App SHALL show the new state in the same render, with no waiting indicator.
6. THE App SHALL treat "interactive" as: the page responds to the User through the Live_Summary, the clickable steps, the Sticky_Panels, the filters and the hover and pressed colours, and SHALL add no animation for that purpose.

### Requirement 14: Accessibility and safety rules

**User Story:** As a User with a disability, I want every new screen to be readable and operable, so that I can use the App with my keyboard, my screen reader or my low vision.

#### Acceptance Criteria

1. THE Contrast_Registry SHALL list every new colour pair introduced by this feature (text on page background, muted text on card, accent text and button text, the Urgency_Meter and Urgency_Badge pairs, the confidence bar, the Job_Tracker states, the Booking_Card border, the Filter_Chip states, the table header, the emergency row, the footer link and the Emergency_Reason_Sentence) in both themes where the pair appears in both.
2. FOR ALL pairs in the Contrast_Registry, THE contrast ratio SHALL be at least 4.5:1 for body text and at least 3:1 for large text and for non-text components (property).
3. THE App SHALL give every button, link, chip, select, radio and text box a touch target of at least 44 by 44 CSS pixels, except an inline link inside a sentence.
4. THE App SHALL show a visible focus indicator with a contrast ratio of at least 3:1 on every focusable element, in both themes.
5. THE App SHALL keep every emergency rule of `safety.md`, `intake-and-triage` and `haunted-mode`: the fixed Emergency_Message, urgency `emergency`, no do-it-yourself steps, rules applied in code and never through the AI, and an emergency page that is never themed.
6. THE App SHALL leave `src/lib/safety/`, `EMERGENCY_MESSAGE` and `src/components/sourceScan.test.ts` unchanged, and SHALL pass the Source_Scan_Test as it is.
7. THE App SHALL label every cost "rough range, not a quote" and show the confidence level on every screen that shows a cost.
8. THE App SHALL show Job_Status, urgency, selection and current-step state as text or a visible mark in addition to colour.

### Requirement 15: Tests

**User Story:** As a developer, I want automated tests for the new behaviour, so that a later change cannot break the screens or the safety rules.

#### Acceptance Criteria

1. THE existing tests SHALL keep passing, except the tests that this feature changes on purpose, and each such test SHALL be named in the task that changes it.
2. THE Normal_Baseline_Test SHALL be updated on purpose for the new Normal-theme classes, and each changed class SHALL be listed in the comment at the top of that test (Requirement 1, criterion 9).
3. THE test suite SHALL include tests for the Job_Tracker: the current step for each Job_Status, the Tracker_End_State for `declined`, the status text, the "Updates every 30 seconds." text, the Refresh button, and no tracker on an Emergency_Page.
4. THE test suite SHALL include tests for the Urgency_Meter: the four labels, the current step for each of Monitor, Soon and Urgent (property), the visible text label, and no meter on an Emergency_Page.
5. THE test suite SHALL include tests for the Filter_Chips: the counts (property), the filtered rows, the empty-filter text, the pressed state, and the kept selection after Refresh.
6. THE test suite SHALL include tests for the Copy_Link_Button: the copied text, the "Link copied" polite live region for at least 2 seconds (with fake timers), the Copy_Fallback_Box with the selected address when copying fails, and no button on an Emergency_Page.
7. THE test suite SHALL include tests for the Step 2 dropdowns of Requirement 16, the Live_Summary and the clickable steps of Requirement 17.
8. THE test suite SHALL include tests for the Emergency_Reason_Sentence of Requirement 18.
9. THE test suite SHALL include tests of the Layout_Definition of the Home_Page, the Results_Page and the Pro_Job_Page, for the Phone_Layout and the Desktop_Layout, that check the section order and the column of each section.
10. THE test suite SHALL include a test of the Contrast_Registry rows added by this feature.
11. THE test suite SHALL include tests that the Haunted_Theme keeps the same section order and the same text as the Normal_Theme on the Home_Page, the Results_Page and the Pro_Job_Page.
12. THE test suite SHALL run with `vitest --run`, and the whole project SHALL pass `next lint` and `tsc --noEmit` after each parent task.
13. THE final checkpoint SHALL include a browser check with the Playwright MCP server on localhost of the Home_Page and the `/pro` access code screen, at 390 px and 1280 px, in the Normal_Theme and the Haunted_Theme, and a check of the Sticky_Panel rule of Requirement 17, criterion 9 in a short window, with the result noted in `BUILD_LOG.md`.
14. THE final checkpoint SHALL list the Results_Page, the booking section and the Pro_Job_Page as screens that the owner checks by hand on the live site, and SHALL note that in `BUILD_LOG.md`.

### Requirement 16: Step 2 dropdowns (changes spec 5)

**User Story:** As a Homeowner, I want to choose the room and how long from dropdowns, so that Step 2 is short and easy to use on a phone.

#### Acceptance Criteria

1. THE Guided_Intake SHALL show the Location_Select on Step 2 as a native `<select>` with the visible label "Where is the problem?", and SHALL show the Duration_Select as a native `<select>` with the visible label "How long has this been going on?".
2. THE Location_Select SHALL offer an empty first option "Choose a room" followed by exactly the Location_Options of spec 5, and THE Duration_Select SHALL offer an empty first option "Choose how long (optional)" followed by exactly the Duration_Options of spec 5, both in the same order as spec 5.
3. THE Guided_Intake SHALL keep the Safety_Group and the Extras_Group ("Anything else?") as multi-choice chips, and the Exact_Place_Text box "Exactly where?" and the Something_Else_Text box with their existing behaviour.
4. WHILE the Location_Select has the value "Other", THE Guided_Intake SHALL mark "Exactly where?" as required, as spec 5 requires.
5. WHEN the Homeowner activates the Sample_Button, THE Guided_Intake SHALL set the Location_Select and the Duration_Select to the values the Sample_Manifest lists, and the Homeowner SHALL be able to change them.
6. IF the Homeowner activates the Next button on Step 2 while the Location_Select has the empty option, THEN THE Guided_Intake SHALL stay on Step 2, show an error message next to the Location_Select, set `aria-invalid="true"` on it, link the message to it with `aria-describedby`, and move focus to it.
7. WHEN the Homeowner chooses a room after that error, THE Guided_Intake SHALL remove the error message and `aria-invalid`.
8. THE Guided_Intake SHALL send the same Answer_Strings as before for the same choices, so that FOR ALL Intake_State values, THE Answer_Strings produced with the dropdowns SHALL equal the Answer_Strings produced by the chips of spec 5 for the same choices (property), and the existing guided-intake answer property tests SHALL stay unchanged and pass.
9. THE Duration_Select SHALL allow the empty option, so that no duration is sent as an empty string, as spec 5 does when no duration chip is selected.
10. THE Location_Select and the Duration_Select SHALL be at least 44 px high, SHALL show the visible focus indicator of Requirement 14, and SHALL keep the keyboard behaviour of a native `<select>`.
11. THE Step 3 review and the Live_Summary SHALL show the chosen room and duration with the same text as before.
12. THE tasks of this feature SHALL include updating the `guided-intake` requirements, design and tasks documents so that they describe the two dropdowns instead of the two chip groups, and the criteria of `guided-intake` that name them (the Location_Group and Duration_Group definitions, Requirement 5 criteria 2 to 6, Requirement 6 criteria 2, 9 and 10, Requirement 9 criterion 4 and Requirement 13 criterion 6) SHALL be changed in those documents in the same task.
13. THE guided-intake tests that cover the two chip groups (keyboard, accessible names and chip selection for the Location_Group and Duration_Group) SHALL be replaced by tests of the two dropdowns, and the replaced tests SHALL be named in the task.

### Requirement 17: Desktop layout

**User Story:** As a Homeowner on a desktop, I want to use the extra width, so that I can see my progress and the booking beside the page I am working on.

#### Acceptance Criteria

1. WHILE the viewport is 1024 px wide or wider, THE Home_Page SHALL show two columns: the left column holds the current Step, and the right column holds the Inspection_Panel as a Sticky_Panel.
2. THE Inspection_Panel SHALL be titled "Your inspection" and SHALL show the Step_List and the Live_Summary.
3. THE Step_List SHALL show the three Steps top to bottom. Each finished Step SHALL be a button that returns the Homeowner to that Step and keeps the Intake_State unchanged. The current Step SHALL be marked in text ("Current step"). A later Step SHALL NOT be clickable.
4. THE Live_Summary SHALL show the photo thumbnails, the safety answers ("None selected" when none), where, how long and anything else, using the same text as the Review_Text of Step 3.
5. WHEN the Homeowner taps a chip, chooses a dropdown value, types in a text box or adds or removes a file, THE Live_Summary SHALL show the change in the same render.
6. WHILE the viewport is below 1024 px, THE Home_Page SHALL show one column in the order of Requirement 3 and SHALL NOT show the Inspection_Panel.
7. WHILE the viewport is 1024 px wide or wider, THE Results_Page SHALL show two columns for a non-emergency job: the left column holds the Urgency_Meter, the title, "Who to call" with the confidence, the cost, the job brief, the questions, the safe things and the Chat_Panel; the right column holds the Job_Tracker, the booking section and the line with the Copy_Link_Button, and is a Sticky_Panel. THE Results_Page SHALL put the left column before the right column in the DOM, so that the Phone_Layout order of Requirement 4, criterion 1 and the Desktop_Layout reading order are the same order. THE Help_Section SHALL run the full width below both columns.
8. THE "Start a new inspection" link SHALL stay above the two columns on the Desktop_Layout.
9. WHILE the window is tall enough to show the whole of a Sticky_Panel (a minimum-height media query), THE page SHALL keep that panel in view while the page scrolls. WHILE the window is shorter than that, THE page SHALL let the panel scroll with the page like any other section, SHALL show the whole panel, and SHALL NOT put a scroll box inside the panel.
10. THE Home_Page, the Results_Page and the Pro_Pages SHALL centre their content in a column with a maximum width (42 rem for a single Guided_Intake column, 1120 px for the two-column pages), so that lines do not grow too long at 1920 px.
11. WHILE a view is an Emergency_Page, THE App SHALL show one plain column with no side panel at every width.
12. THE Home_Page, the Results_Page and the Pro_Job_Page SHALL use one DOM order for both layouts: the left column first, then the right column, with the Phone_Layout showing the same order in one column, so that the keyboard Tab order follows the visual reading order in both layouts without CSS reordering.
13. THE Layout_Definition SHALL list the sections of the Results_Page in the order of Requirement 4, criterion 1 for the Phone_Layout, and the Desktop_Layout columns SHALL concatenate, left then right, to that same order.
14. THE Desktop_Layout SHALL show no horizontal scroll bar from 1024 px to 1920 px.

### Requirement 18: Emergency reason

**User Story:** As a Homeowner or Pro_User looking at an emergency, I want one short line that says why it is an emergency, so that I understand the danger.

#### Acceptance Criteria

1. WHEN the App turns a job into an emergency, THE App SHALL save the Emergency_Rule that fired and the Emergency_Source with the job as the fields `emergencyRule` and `emergencySource`, taking the Emergency_Rule from the Emergency_Rule_Wrapper.
2. THE App SHALL set the Emergency_Source to `precheck` WHEN the check before the AI fires, to `postcheck` WHEN the check on the AI's answer fires, and to `override` WHEN a chat message or a reply turns an existing job into an emergency.
3. WHEN a booking request arrives for a job that is already an emergency, THE App SHALL return the existing emergency (HTTP 409) and SHALL NOT set or change the Emergency_Rule or the Emergency_Source, because a booking request carries no Homeowner text.
4. THE Emergency_Rule_Wrapper SHALL be a module outside `src/lib/safety/` that calls the unchanged safety code to supply the Emergency_Rule code, and THE routes SHALL keep deciding whether a text is an emergency with `replyTriggersEmergency` and the existing checks.
5. FOR ALL texts, THE `isEmergency` value of the Emergency_Rule_Wrapper SHALL equal `replyTriggersEmergency(text)` (required property test).
6. WHEN the App adds `emergencyRule` and `emergencySource` to `POST /api/inspect`, THE route SHALL keep its order of steps: the check before the AI stays before the rate limiter and before Bedrock, and the existing route-order and emergency-over-limit tests (`route.emergencyOverLimit.test.ts` and the route order tests) SHALL keep passing unchanged.
7. THE App SHALL NOT save the Homeowner's text, any part of it, any matched word or any position in it, in the Emergency_Rule, the Emergency_Source or any other new attribute.
8. WHILE a job is already an emergency, THE App SHALL NOT change its saved Emergency_Rule or Emergency_Source, and SHALL NOT write to the job, as `pro-dashboard-and-booking` Requirement 6, criterion 12 requires.
9. THE Emergency_Reasons_File SHALL hold exactly these four sentences, one per Emergency_Rule:
   - `GAS_SMELL`: "This may be a gas leak."
   - `ELECTRICAL_FIRE`: "This may be an electrical fire risk."
   - `WATER_ELECTRICAL`: "Water near electricity can cause shocks or a fire."
   - `CO_ALARM`: "A carbon monoxide alarm means the air may be unsafe to breathe."
10. THE Emergency_Reasons_File SHALL be in `src/lib/emergency/` next to `messages.ts`, and THE App SHALL NOT change `EMERGENCY_MESSAGE` or any file in `src/lib/safety/`.
11. WHILE a view is the Homeowner's Emergency_Page and the job has a saved Emergency_Rule, THE Results_Page SHALL show the Emergency_Reason_Sentence of that rule directly under the Emergency_Banner, before the Emergency badge.
12. WHILE a view is the Pro_User's Emergency_Page and the job has a saved Emergency_Rule, THE Pro_Job_Page SHALL show the Emergency_Reason_Sentence of that rule directly under the Pro_Emergency_Note.
13. THE Emergency_Reason_Sentence SHALL use one fixed plain style that no theme changes, SHALL carry no `haunted:` class, and SHALL never come from the AI.
14. IF a job was saved before this feature, or has no saved Emergency_Rule, THEN THE Results_Page and THE Pro_Job_Page SHALL show no Emergency_Reason_Sentence and SHALL show the rest of the Emergency_Page unchanged.
15. WHEN the Homeowner's Emergency_Page is shown from an emergency result that the App just returned (the inspect response, a chat message, a reply, a booking request or a status poll), THE App SHALL show the Emergency_Reason_Sentence with that response, so that the sentence does not wait for a page reload.
16. THE design SHALL list every response and stored shape that gains an emergency-rule field, and THE tasks SHALL update the existing tests that fix those shapes on purpose, each named in its task, and SHALL leave `emergencyIrreversible.property.test.ts` passing.
17. THE test suite SHALL include a test for each of the four rules (the saved rule, the saved source and the shown sentence), a test that a job without a saved rule shows no sentence, a test that no Homeowner text is stored in any new attribute (property: FOR ALL Homeowner texts that trigger an emergency, the saved job contains none of the text), a test for each Emergency_Source, and a test that the sentence carries no `haunted:` class.
