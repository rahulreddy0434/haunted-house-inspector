# Requirements Document

## Introduction

The chat-and-help feature adds three things to Haunted House Inspector.

1. **Chat.** Each Job gets one Chat_Thread shared by the Homeowner and the Pro_User. The Chat_Thread replaces the Pro_User's "Ask a question" form and the Homeowner's reply box from `pro-dashboard-and-booking`. Existing questions and replies appear as the first messages of the thread.
2. **Help form.** A "Need help? Contact us" section at the bottom of every page except Emergency_Views. A submitted message is saved in the jobs table and emailed with Amazon SES.
3. **Page order.** On both job pages, booking controls move to the bottom, below the chat.

The feature builds on `pro-dashboard-and-booking` (Job_Status rules, Pro_Cookie, Safety_Layer use in the reply route, Properties 3 and 5) and `haunted-mode` (themes, Emergency_Page rules, Source_Scan_Test). Safety overrides everything. The rules in `safety.md` still apply: every Homeowner free text (a chat message or a help message) goes through the Safety_Layer before any other check, an emergency Job stays an emergency, and the fixed Emergency_Message is shown without do-it-yourself steps.

### Delivery constraints

- The old question-and-reply flow keeps working, unchanged, until one final Switch_Over task. The app can ship after any task.
- The later tasks phase orders the parent tasks as: (1) data and safety, (2) routes, (3) chat screens, (4) switch-over, (5) help form, (6) page order, (7) final checkpoint. Each parent task is small and leaves the app working.
- Product code under `src/lib/safety/` and the file `src/components/sourceScan.test.ts` are not changed. New components in directories scanned by the Source_Scan_Test pass that test as it is.
- The text of `EMERGENCY_MESSAGE` and the other texts in `src/lib/emergency/messages.ts` are not changed.
- The only new npm package is `@aws-sdk/client-sesv2`, pinned to the same exact version as the other `@aws-sdk` packages (currently `3.1163.0`).
- Existing screens are not restyled. A later spec (`screens-polish`) restyles them. New UI uses the existing styles and tokens.
- No code is written in the requirements and design phases.

### Existing code this feature touches

| Area | Current state |
|---|---|
| `src/app/api/inspections/[id]/reply/route.ts` | Homeowner reply: body limit, Safety_Layer on the untrimmed text, then UUID, length, load, status, reply limit (5), conditional write |
| `src/app/api/pro/jobs/[id]/ask-info/route.ts` | Pro_User asks one question; status `new` to `info_requested` |
| `src/lib/aws/jobs.ts` | `getJob`, `applyTransition`, `applyReply`, `applyBooking`, `applySafetyOverride` (single table, `JOB#<id>` keys, GSI1) |
| `src/lib/safety/replyCheck.ts` | `replyTriggersEmergency(text)` wraps `checkEmergency` |
| `src/lib/rateLimiter.ts` | 15 inspections per day per visitor, signed `hhi_session` cookie and hashed IP |
| `src/lib/jobs/copy.ts`, `src/lib/emergency/messages.ts` | Fixed user-facing texts |
| `src/components/upload/DataRetentionNotice.tsx` | `DATA_SHARING_NOTICE_TEXT` says "photos and answers" |
| `amplify.yml`, `.env.example` | Environment variable names forwarded to the build |
| Property 3 and Property 5 tests | `reply.safety.property.test.ts` (Property 3) and `proText.property.test.ts` (Property 5) from `pro-dashboard-and-booking` |

### Out of scope

- WebSockets, server-sent events and push notifications.
- Attachments, images, links, formatting, emoji pickers, read receipts, typing indicators, editing and deleting messages.
- Email or SMS notifications to the Homeowner or Pro_User about chat messages.
- Accounts, payments and real calendars.
- Changing the Emergency_Message, `src/lib/safety/` or `sourceScan.test.ts`.
- Restyling existing screens.

## Glossary

- **App**: The Haunted House Inspector Next.js web application.
- **Homeowner**: A User who created a Job and follows it on the Results_Page; authorised only by knowing the Job id.
- **Pro_User**: A tradesperson using the Pro_Pages; authorised only by a valid Pro_Cookie.
- **Visitor**: Any person using the App, identified for rate limiting the way `src/lib/rateLimiter.ts` identifies one (signed `hhi_session` cookie, or the hashed Trusted_Client_IP when no cookie secret exists).
- **Side**: One of `homeowner` or `tradesperson`; the party that sends a message or a help message.
- **Job**: One stored inspection with its Job_Status (item `JOB#<id>`).
- **Job_Status**: One of `new`, `info_requested`, `accepted`, `declined`, `booked`, `emergency`.
- **Open_Status**: A Job_Status of `new`, `info_requested`, `accepted` or `booked`.
- **Emergency_Job**: A Job whose Job_Status is `emergency`.
- **Emergency_View**: The Emergency_Page of `haunted-mode`: the Results_Page or the Pro_Job_Page for an Emergency_Job, and the Results_Page after a Homeowner chat message or booking returns the emergency outcome. The Emergency_Message shown inside the Help_Form is not an Emergency_View (Requirement 12).
- **Emergency_Banner**: The existing `EmergencyBanner` component, which shows the Emergency_Message in a fixed high-contrast style.
- **Pro_Emergency_Note**: The exact text in `PRO_EMERGENCY_NOTE` from `src/lib/emergency/messages.ts`.
- **Pro_Auth**: The existing server-side module that checks the Access_Code and signs and verifies the Pro_Cookie.
- **Access_Code**: The shared demo secret held in `PRO_ACCESS_CODE`.
- **Time_Slot**: A proposed appointment start time, as defined in `pro-dashboard-and-booking`.
- **Trusted_Client_IP**: The client address returned by the existing `getTrustedClientIp`.
- **Hashed_IP**: The one-way keyed hash (HMAC-SHA256 with `SESSION_SECRET`) of the Trusted_Client_IP; the raw address is never stored or logged.
- **Contrast_Registry**: The typed list of every colour pair and its contrast ratio defined in `haunted-mode`.
- **Help_API**: The Route Handler that receives a Help_Message, runs the checks, saves the Help_Record and sends the Help_Email.
- **Job_Index**: The sparse DynamoDB index `GSI1` that holds only Job items.
- **Emergency_Message**: The exact text in `EMERGENCY_MESSAGE` from `src/lib/emergency/messages.ts`.
- **Safety_Layer**: The server-side module `src/lib/safety/safetyLayer.ts` and the helper `replyTriggersEmergency` in `src/lib/safety/replyCheck.ts`.
- **Trigger**: A text for which the Safety_Layer reports an emergency (gas smell, electrical fire, water near electrical, carbon monoxide alarm).
- **Chat_Thread**: The single ordered list of Chat_Messages of one Job, including Legacy_Messages.
- **Chat_Message**: One plain-text message with a Side, a text and a sent time (ISO 8601 UTC).
- **Legacy_Message**: A question stored as an `infoRequests` entry (Side `tradesperson`) or a reply stored as a `replies` entry (Side `homeowner`) on a Job from `pro-dashboard-and-booking`; shown as a Chat_Message with its stored time.
- **Chat_Open**: The state in which a Chat_Thread accepts new Chat_Messages and shows the message box: the Job_Status is an Open_Status.
- **Chat_Read_Only**: The state in which a Chat_Thread shows its history and no message box: the Job_Status is `declined`.
- **Chat_Panel**: The client component that shows one Chat_Thread, the message box and the Send button, on the Results_Page and on the Pro_Job_Page.
- **Chat_API**: The Route Handlers that read and write Chat_Messages: one pair for the Homeowner (authorised by the Job id) and one pair for the Pro_User (authorised by the Pro_Cookie).
- **Poll_Interval**: The delay between two checks for new Chat_Messages: 5 seconds (Fast_Interval) or 30 seconds (Slow_Interval).
- **Quiet_Period**: 2 minutes without a new Chat_Message arriving in the open Chat_Thread.
- **Message_Rate_Limit**: At most 10 Chat_Messages per minute from one Side in one Job.
- **Thread_Limit**: At most 100 Chat_Messages in one Chat_Thread; Legacy_Messages do not count toward it.
- **Pro_Pages**: The pages `/pro` (access code form and job list) and `/pro/jobs/[id]`.
- **Pro_Job_Page**: The page `/pro/jobs/[id]`.
- **Pro_Cookie**: The signed `hhi_pro` cookie defined in `pro-dashboard-and-booking`.
- **Results_Page**: The page `/inspect/[id]`.
- **Home_Page**: The page `/`.
- **Status_Panel**: The Results_Page component that shows Job_Status, the offered Time_Slots and the booking confirmation.
- **Booking_Controls**: On the Pro_Job_Page, the "Accept and offer times" form, or the offered or booked Time_Slots once accepted. On the Results_Page, the "Pick a time" control, or the booking confirmation.
- **Help_Section**: The "Need help? Contact us" section with the Help_Form.
- **Help_Form**: The form with fields Name, Email, Message and Honeypot.
- **Help_Message**: One submission of the Help_Form.
- **Honeypot**: A form field that is hidden from people and from assistive technology and that bots fill in.
- **Help_Record**: The DynamoDB item that stores one Help_Message under its own key with a 30-day TTL.
- **Help_Email**: The email sent through Amazon SES for one Help_Message.
- **Help_Limit**: At most 5 Help_Messages per Visitor per day, counted separately from the 15-inspections-per-day limit.
- **Privacy_Notice**: The text shown by `DataRetentionNotice` before a Homeowner uploads.
- **Job_Table**: The single DynamoDB table named in `DYNAMODB_TABLE_NAME`.
- **Switch_Over**: The one final task that replaces the old question form and reply box with the Chat_Panel and removes only those old screens. The ask-info and reply routes and their tests stay in place, unused by any screen, until after judging.
- **Booking_Data**: The booking facts of a Job that the Status_Panel, the Booking_Controls and the Pro_Job_Page status text need: the offered Time_Slots, the booked Time_Slot and the decline reason.
- **Results_Page_Notice**: The line near the bottom of the Results_Page about who can see the page and when it is deleted (Requirement 9, criterion 8).
- **Source_Scan_Test**: The existing test `src/components/sourceScan.test.ts`.
- **Plain_Text**: Text rendered as escaped characters, never as HTML.

## Requirements

### Requirement 1: One chat thread per job

**User Story:** As a Homeowner or Pro_User, I want one conversation for each job, so that questions and answers stay together.

#### Acceptance Criteria

1. THE App SHALL give each Job exactly one Chat_Thread.
2. THE Chat_Panel SHALL appear on the Results_Page for the Homeowner and on the Pro_Job_Page for the Pro_User, both showing the same Chat_Thread.
3. WHEN a Job has Legacy_Messages, THE Chat_Thread SHALL include each `infoRequests` entry as a Chat_Message with Side `tradesperson` and each `replies` entry as a Chat_Message with Side `homeowner`, each with its stored time.
4. THE Chat_Thread SHALL order its Chat_Messages by sent time ascending, and SHALL keep the stored order for Chat_Messages with the same sent time.
5. WHEN the Switch_Over is complete, THE Chat_Panel SHALL replace the Pro_User's "Ask a question" form and the Homeowner's reply box.
6. THE App SHALL NOT change or delete stored `infoRequests` and `replies` entries when it shows them as Legacy_Messages.

### Requirement 2: Job status rules for chat

**User Story:** As a Pro_User, I want my first message on a new job to ask the homeowner for information, so that the Homeowner sees the job is waiting for them.

#### Acceptance Criteria

1. WHEN the Pro_User sends a Chat_Message and the Job_Status is `new`, THE Chat_API SHALL save the Chat_Message and set the Job_Status to `info_requested` in one conditional write.
2. WHEN the Homeowner sends a Chat_Message and the Job_Status is `info_requested`, THE Chat_API SHALL save the Chat_Message and set the Job_Status to `new` in one conditional write.
3. WHEN a Chat_Message is sent and the Job_Status is an Open_Status that criteria 1 and 2 do not cover, THE Chat_API SHALL save the Chat_Message and leave the Job_Status unchanged.
4. WHILE the Job_Status is `info_requested`, THE Pro_Job_Page SHALL show the text "Waiting for the homeowner's reply", and THE Status_Panel SHALL show its existing `info_requested` text on the Results_Page.
5. WHEN the Pro_User accepts, declines or books through the existing routes, THE App SHALL apply the same Job_Status transitions as `pro-dashboard-and-booking`, whether or not the Job has Chat_Messages.
6. IF a conditional write fails because the Job_Status changed after it was read, THEN THE Chat_API SHALL re-read the Job and apply the rules of this requirement and Requirement 3 once, and WHEN the second attempt also fails, THE Chat_API SHALL respond with the existing conflict response.
7. FOR ALL sequences of Chat_Messages sent from either Side in any Open_Status, THE resulting Job_Status SHALL equal the status that the rules of criteria 1 to 3 give when applied one message at a time (property).

### Requirement 3: When the chat is open

**User Story:** As a User, I want the chat to be available only when it makes sense, so that I never write into a closed job.

#### Acceptance Criteria

1. WHILE the Job_Status is an Open_Status, THE Chat_Panel SHALL be Chat_Open on both Sides.
2. WHILE the Job_Status is `declined`, THE Chat_Panel SHALL show the Chat_Thread history as Chat_Read_Only, with no message box and no Send button, on both Sides.
3. WHILE the Job_Status is `emergency`, THE App SHALL render no Chat_Panel, no Chat_Message and no message box on either Side.
4. IF a Chat_Message is sent for a Job whose Job_Status is `declined`, THEN THE Chat_API SHALL respond with HTTP 409, the error `ILLEGAL_TRANSITION` and the existing message, and SHALL NOT save the Chat_Message.
5. IF a Chat_Message is sent for an Emergency_Job, THEN THE Chat_API SHALL respond with HTTP 409, the error `JOB_IS_EMERGENCY` and the Emergency_Message, and SHALL NOT save the Chat_Message.
6. IF the Chat_Thread of an Emergency_Job is requested, THEN THE Chat_API SHALL respond with HTTP 409, the error `JOB_IS_EMERGENCY`, and SHALL NOT return any Chat_Message.
7. WHEN a poll or a send shows that the Job_Status became `declined`, THE Chat_Panel SHALL switch to Chat_Read_Only without a page reload.
8. WHEN a poll or a send shows that the Job_Status became `emergency`, THE Chat_Panel SHALL be removed in the same render that shows the emergency view, without a page reload.
9. IF the Job id is not a valid UUID or the Job does not exist, THEN THE Chat_API SHALL respond with HTTP 404 and the error `NOT_FOUND`.

### Requirement 4: Safety first for Homeowner chat messages

**User Story:** As a Homeowner who mentions a danger in the chat, I want to be told to get to safety right away, so that nothing delays the warning.

#### Acceptance Criteria

1. WHEN the Homeowner sends a Chat_Message, THE Chat_API SHALL run the Safety_Layer on the full untrimmed text before the Job id check, the length check, the message rate check, the thread limit check and every database read or write.
2. IF the Homeowner's Chat_Message is a Trigger, THEN THE Chat_API SHALL respond with HTTP 200, the status `emergency` and the exact Emergency_Message, whatever the Job_Status, the message count or the Message_Rate_Limit state.
3. IF the Homeowner's Chat_Message is a Trigger and the Job exists and is not an Emergency_Job, THEN THE Chat_API SHALL set the Job to emergency with the same override that the reply route uses today (urgency `emergency`, cost range 0, empty job brief, no do-it-yourself steps, offered and booked slots removed).
4. THE Job_Status `emergency` SHALL stay for good: no Chat_Message and no other Job_Action SHALL move an Emergency_Job to another Job_Status.
5. WHEN a Trigger Chat_Message makes a Job an emergency, THE Results_Page SHALL show the Emergency_Message, the Chat_Panel SHALL close, and the Pro_Job_Page SHALL show the emergency view with the Pro_Emergency_Note and no Chat_Panel.
6. THE Chat_API SHALL NOT show the Trigger Chat_Message in any Chat_Thread, because an Emergency_Job has no Chat_Panel.
7. WHEN the Pro_User sends a Chat_Message, THE Chat_API SHALL NOT run the Safety_Layer on it, and a Pro_User Chat_Message SHALL NOT change a Job_Status to `emergency`.
8. IF the Safety_Layer override write fails, THEN THE Chat_API SHALL still respond with the Emergency_Message and SHALL log only the error name.

### Requirement 5: Message content and display

**User Story:** As a User, I want clear short messages that show who wrote them and when, so that I can follow the conversation.

#### Acceptance Criteria

1. THE Chat_API SHALL accept a Chat_Message text whose length after trimming surrounding whitespace is 1 to 500 characters, and SHALL save the trimmed text.
2. IF the trimmed text is empty, THEN THE Chat_API SHALL respond with HTTP 400, the error `INVALID_REQUEST` and the existing empty-reply message, and SHALL NOT save anything.
3. IF the trimmed text is longer than 500 characters, THEN THE Chat_API SHALL respond with HTTP 400, the error `INVALID_REQUEST` and the existing too-long message, and SHALL NOT save anything.
4. THE Chat_Panel SHALL render every Chat_Message text as Plain_Text.
5. THE Chat_Panel SHALL label each Chat_Message with its sender: "You" for a message sent from the viewer's own Side, "Homeowner" for a Homeowner message on the Pro_Job_Page, and "Tradesperson" for a Pro_User message on the Results_Page.
6. THE Chat_Panel SHALL show the sent time of each Chat_Message in a `<time>` element, in the browser's time zone, with the time zone name visible and `dateTime` holding the UTC value.
7. THE Chat_Panel SHALL show the newest Chat_Message at the bottom of the thread.
8. WHEN a new Chat_Message arrives while the Chat_Panel is shown, THE Chat_Panel SHALL announce it to screen readers with a polite live region (`aria-live="polite"`), and SHALL NOT announce the Chat_Messages present at first load.
9. WHEN the Chat_Thread has no Chat_Message, THE Chat_Panel SHALL show a short empty text in plain words.
10. FOR ALL text strings of 1 to 500 characters after trimming, THE Chat_Panel SHALL render the string as the text content of one element, so that reading that element's text returns the trimmed string unchanged (round-trip property).
11. THE Chat_API SHALL reject a request body larger than 4 KB with HTTP 413 and the error `PAYLOAD_TOO_LARGE`.

### Requirement 6: Polling

**User Story:** As a User, I want new messages to appear without reloading, so that the conversation feels live.

#### Acceptance Criteria

1. WHILE the Chat_Panel is Chat_Open and the browser tab is visible, THE Chat_Panel SHALL check the Chat_API for new Chat_Messages every 5 seconds.
2. WHEN a Quiet_Period passes without a new Chat_Message, THE Chat_Panel SHALL change the Poll_Interval to 30 seconds.
3. WHEN a new Chat_Message arrives while the Poll_Interval is 30 seconds, or the viewer sends a Chat_Message, THE Chat_Panel SHALL change the Poll_Interval back to 5 seconds and restart the Quiet_Period.
4. WHILE the Chat_Panel is Chat_Read_Only, THE Chat_Panel SHALL NOT poll the Chat_API.
5. WHILE the Job is an Emergency_Job, THE App SHALL NOT poll the Chat_API.
6. WHILE the browser tab is hidden, THE Chat_Panel SHALL NOT poll the Chat_API.
7. WHEN the browser tab becomes visible and the Chat_Panel is Chat_Open, THE Chat_Panel SHALL check the Chat_API once at once and resume the 5-second Poll_Interval.
8. THE Chat_Panel SHALL NOT use WebSockets or server-sent events.
9. THE Chat_Panel SHALL NOT start a new check while the previous check is still in progress.
10. IF a check fails, THEN THE Chat_Panel SHALL keep the messages it shows, show a short error text in plain words, and try again at the current Poll_Interval.
11. WHEN the Chat_Panel unmounts, THE Chat_Panel SHALL cancel every timer and every request in progress.
12. THE Poll_Interval selection SHALL be implemented as a pure function of the time since the last new Chat_Message, the tab visibility and the Chat state, so that the 5-second, 30-second and stopped cases are testable with fake timers.
13. THE Chat_API SHALL include the current Job_Status and the Booking_Data in every successful poll response and every successful send response, on both the Homeowner and the Pro_User routes.
14. WHEN a poll or a send returns a Job_Status that differs from the Job_Status the page shows, THE Results_Page SHALL update the Status_Panel, the Booking_Controls and the Chat_Panel in the same render, so that the chat and the rest of the page show one Job_Status.
15. WHEN a poll or a send returns a Job_Status that differs from the Job_Status the page shows, THE Pro_Job_Page SHALL update the status text, the Booking_Controls and the Chat_Panel in the same render.
16. WHEN the Pro_User accepts a Job, THE Results_Page SHALL show the "Pick a time" control within one chat poll, without waiting for the 30-second status poll.
17. WHEN the Homeowner books a Time_Slot, THE Pro_Job_Page SHALL show the booked Time_Slot within one chat poll.
18. WHEN a poll or a send changes the Job_Status or the Booking_Data without a new Chat_Message, THE Chat_Panel SHALL keep the current Poll_Interval and the Quiet_Period unchanged.
19. WHEN a poll or a send returns the HTTP 409 response with the error `JOB_IS_EMERGENCY` (Requirement 3, criteria 5 and 6), THE page SHALL treat it as a change of the Job_Status to `emergency` and apply Requirement 3, criterion 8.

### Requirement 7: Chat limits, privacy and logging

**User Story:** As the owner of the App, I want chat limits and short retention, so that the chat stays cheap and private.

#### Acceptance Criteria

1. IF a Chat_Thread already holds 100 Chat_Messages, THEN THE Chat_API SHALL respond with HTTP 429, the error `THREAD_LIMIT_REACHED` and a friendly message, and SHALL NOT save the Chat_Message.
2. IF one Side has sent 10 Chat_Messages in the same Job in the last 60 seconds, THEN THE Chat_API SHALL respond to the next Chat_Message from that Side with HTTP 429, the error `MESSAGE_RATE_LIMITED`, a `Retry-After` header with the whole seconds to wait, and a friendly message, and SHALL NOT save the Chat_Message.
3. THE Chat_API SHALL count the Message_Rate_Limit separately for each Side and each Job.
4. THE Chat_Panel SHALL show a limit message as text, keep the typed text in the message box, and keep focus in the message box.
5. THE Chat_API SHALL store Chat_Messages with the Job so that they receive the same 30-day expiry as the Job.
6. THE Chat_API SHALL NOT log any Chat_Message text, and SHALL log only the error name when an operation fails.
7. THE Chat_API SHALL return `Cache-Control: no-store` on every response.
8. THE Chat_API SHALL NOT count a Chat_Message toward the 15-inspections-per-day limit or the Help_Limit.
9. IF the Thread_Limit and the Message_Rate_Limit both apply, THEN THE Chat_API SHALL respond with the Thread_Limit response.
10. FOR ALL sequences of Chat_Messages, THE Chat_Thread SHALL never hold more than 100 Chat_Messages, and one Side SHALL never have more than 10 saved Chat_Messages in any 60-second window (property).
11. THE Chat_API SHALL save every Chat_Message without any Job_Index (`GSI1`) attribute, so that no Chat_Message appears in the Job_Index or in the Pro_User's job list.

### Requirement 8: Pro_User access to the chat

**User Story:** As the owner of the App, I want only a signed-in tradesperson to write as the Tradesperson, so that job conversations stay private.

#### Acceptance Criteria

1. WHEN a request reaches a Pro_User Chat_API route, THE Chat_API SHALL verify the Pro_Cookie with the existing Pro_Auth check before parsing the body, validating the Job id or calling DynamoDB.
2. IF the Pro_Cookie is missing or invalid, THEN THE Chat_API SHALL respond with HTTP 401 and the error `UNAUTHORIZED`.
3. THE Homeowner Chat_API routes SHALL accept requests authorised only by the Job id, and SHALL NOT accept a Pro_Cookie as proof of the Homeowner Side.
4. THE Pro_User Chat_API routes SHALL set the Side to `tradesperson` on the server, and THE Homeowner Chat_API routes SHALL set the Side to `homeowner` on the server; no request field SHALL set the Side.
5. IF the Pro_Cookie secret or the Access_Code is not configured, THEN THE Pro_User Chat_API routes SHALL follow the fail-closed rules of `pro-dashboard-and-booking` Requirement 3.

### Requirement 9: Coexistence and switch-over

**User Story:** As the owner of the App, I want the old flow to keep working until one final switch, so that I can stop after any task and still ship.

#### Acceptance Criteria

1. UNTIL the Switch_Over task, THE App SHALL keep the ask-info and reply routes, the Pro_User's "Ask a question" form and the Homeowner's reply box working with their current behaviour.
2. UNTIL the Switch_Over task, THE App SHALL NOT mount the Chat_Panel on any page.
3. WHEN the Switch_Over task is complete, THE Pro_Job_Page SHALL show the Chat_Panel in place of the "Ask a question" form, and THE Results_Page SHALL show the Chat_Panel in place of the reply box.
4. WHEN the Switch_Over task is complete, THE App SHALL show the old questions and replies of existing Jobs as the first messages of the Chat_Thread.
5. WHEN the Switch_Over task is complete, THE Privacy_Notice SHALL read exactly: "Your photos, answers and messages are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days."
6. WHEN the Switch_Over task is complete, THE App SHALL use the status rules of Requirement 2 for every message sent from a screen, THE Switch_Over SHALL remove only the "Ask a question" form and the reply box, and THE ask-info and reply routes SHALL stay in place with their current behaviour, unused by any screen, until after judging.
7. THE existing tests of the old flow SHALL pass at the end of every task, including the Switch_Over task; the Switch_Over task SHALL replace only the tests that cover the removed screens by tests of the Chat_Panel, and THE tests of the ask-info and reply routes SHALL stay and keep passing.
8. WHEN the Switch_Over task is complete, THE Results_Page SHALL show the Results_Page_Notice with exactly this text: "Anyone with this page's link can see it and send messages in the chat. Your photos and messages are deleted after 30 days."
9. THE Privacy_Notice of criterion 5 SHALL appear only before upload (where `DataRetentionNotice` is shown), and THE Results_Page_Notice of criterion 8 SHALL appear only on the Results_Page; THE two texts do not replace each other.

### Requirement 10: Help section placement

**User Story:** As a Visitor, I want a "Need help? Contact us" section on every page, so that I can reach a person from wherever I am.

#### Acceptance Criteria

1. THE App SHALL show the Help_Section, headed "Need help? Contact us", at the bottom of the Home_Page, the Results_Page, the `/pro` page (including the access code form) and the Pro_Job_Page.
2. WHILE a view is an Emergency_View, THE App SHALL render no Help_Section.
3. WHEN the Job_Status changes to `emergency` while the Results_Page or the Pro_Job_Page is open, THE App SHALL remove the Help_Section in the same render that shows the emergency view.
4. THE Results_Page SHALL show the "Start a new inspection" link above the Help_Section.
5. THE App SHALL show exactly one Help_Section on each page.
6. THE Help_Section SHALL work at 390 px and at 1280 px viewport widths without horizontal scrolling.

### Requirement 11: Help form fields and context

**User Story:** As a Visitor, I want a short form that asks only what is needed, so that I can ask for help quickly.

#### Acceptance Criteria

1. THE Help_Form SHALL show a Name field (optional, 1 to 100 characters when filled), an Email field (required) and a Message field (required), each with a visible `<label>`.
2. THE Help_API SHALL accept an email address that is syntactically valid and at most 254 characters, and SHALL reject any other value for that field.
3. THE Help_API SHALL accept a Message whose length after trimming is 1 to 1,000 characters.
4. THE Help_Form SHALL include one Honeypot field that is hidden from people and from assistive technology, is not reachable with the Tab key, and has autocomplete off.
5. WHEN the Help_Form is submitted, THE Help_Form SHALL add the page (the route path with the Job id removed), the Side (`homeowner` on the Home_Page and the Results_Page, `tradesperson` on the Pro_Pages) and the Job id (when the page has one) to the request without asking the Visitor.
6. IF the Email is missing or invalid, or the Message is empty or longer than 1,000 characters after trimming, or the Name is longer than 100 characters, THEN THE Help_Form SHALL show a text error next to the field, and THE Help_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST`, and SHALL save and send nothing.
7. THE Help_API SHALL validate the request body with Zod and SHALL reject a body larger than 8 KB with HTTP 413.
8. THE Help_API SHALL treat the page, the Side and the Job id as untrusted input: the page SHALL be one of the known page names, the Side SHALL be `homeowner` or `tradesperson`, and the Job id SHALL be a UUID when present.
9. THE Help_Form SHALL keep the typed values when a submission fails, and SHALL clear them after a confirmation.
10. FOR ALL valid Help_Message inputs, THE Help_Record read back from the Job_Table SHALL contain the same trimmed Name, Email, Message, page, Side and Job id that were submitted (round-trip property).

### Requirement 12: Safety first for help messages

**User Story:** As a Visitor who describes a danger in the help form, I want to be told to get to safety, so that a contact form never delays the warning.

#### Acceptance Criteria

1. WHEN a Help_Message arrives, THE Help_API SHALL run the Safety_Layer on the Message text, and on the Name text, before the Honeypot check, the Help_Limit check, and every database or SES call.
2. IF the Help_Message is a Trigger, THEN THE Help_API SHALL respond with HTTP 200, the status `emergency` and the exact Emergency_Message.
3. WHEN the Help_API returns the Emergency_Message, THE Help_Form SHALL show it in the existing Emergency_Banner style with no `haunted:` classes and no do-it-yourself steps, and SHALL NOT show the confirmation of Requirement 15.
4. IF the Help_Message is a Trigger, the Honeypot is empty and the Help_Limit is not reached, THEN THE Help_API SHALL count the Help_Message toward the Help_Limit, save the Help_Record and send the Help_Email, both marked as an emergency, and respond with the Emergency_Message.
5. IF the Help_Message is a Trigger and the Honeypot is filled, THEN THE Help_API SHALL still respond with the Emergency_Message and SHALL save and send nothing and leave the Help_Limit counter unchanged.
6. IF the Help_Message is a Trigger and the Help_Limit is reached, THEN THE Help_API SHALL respond with HTTP 200, the status `emergency` and the Emergency_Message, and SHALL save and send nothing; the on-screen Emergency_Message is the safety response, and the Help_Email is not an emergency channel.
7. THE Help_API SHALL NOT change any Job_Status because of a Help_Message.
8. FOR ALL Help_Message texts that contain a Trigger phrase, THE Help_API SHALL respond with the Emergency_Message and SHALL make no DynamoDB or SES call before the Safety_Layer has run (property).

### Requirement 13: Help message delivery

**User Story:** As the owner of the App, I want every help message saved and emailed, so that no request is lost.

#### Acceptance Criteria

1. WHEN a valid Help_Message passes the checks, THE Help_API SHALL save a Help_Record in the Job_Table under its own key prefix (not `JOB#`, `RATELIMIT#` or `PROAUTH#`) with a `ttl` 30 days after the save time, and SHALL NOT store it in the Job_Index.
2. THE Help_Record SHALL hold the Name, Email, Message, Side, page, Job id (when present), the emergency mark, and the save time, and SHALL NOT hold an IP address, a Hashed_IP or a cookie value.
3. WHEN the Help_Record is saved, THE Help_API SHALL send one Help_Email with Amazon SES in `us-east-2`, using the region from `APP_AWS_REGION`, from the address in `CONTACT_FROM_EMAIL` to the address in `CONTACT_TO_EMAIL`, with the Visitor's Email as the Reply-To address.
4. THE Help_Email SHALL contain the Message, the Name, the Email, the Side, the page and the Job id (when present), and the emergency mark when set, and SHALL NOT contain an IP address, a Hashed_IP or a cookie value.
5. THE Help_API SHALL build the Help_Email subject from fixed text and the emergency mark only, and SHALL strip line breaks from every value placed in an email header, so that Visitor text cannot add headers.
6. IF sending the Help_Email fails, or `CONTACT_FROM_EMAIL` or `CONTACT_TO_EMAIL` is unset, THEN THE Help_API SHALL keep the saved Help_Record, respond as for a success, and log only the error name.
7. IF saving the Help_Record fails, THEN THE Help_API SHALL still try to send the Help_Email, and WHEN the Help_Email is sent, THE Help_API SHALL respond as for a success; WHEN both fail, THE Help_API SHALL respond with HTTP 500, the error `ACTION_FAILED` and a friendly message, and THE Help_Form SHALL keep the typed values.
8. THE Help_API SHALL NOT log the Message, Name or Email, and SHALL NOT log any value of `CONTACT_FROM_EMAIL` or `CONTACT_TO_EMAIL`.
9. THE App SHALL add the names `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL` (names only, never values) to the `env | grep` line in `amplify.yml` and to `.env.example` with a one-line comment each.
10. THE App SHALL add `@aws-sdk/client-sesv2` to `package.json` pinned to the exact version of the other `@aws-sdk` packages, and SHALL add no other npm package.
11. THE Help_API SHALL call SES only from a server Route Handler through a client singleton in `src/lib/aws/`, with the IAM compute role as credentials, and no access key in code or environment variables.
12. THE Help_API SHALL return `Cache-Control: no-store` on every response.

### Requirement 14: Help limits and bots

**User Story:** As the owner of the App, I want limits on the help form, so that nobody can flood the inbox.

#### Acceptance Criteria

1. THE Help_API SHALL allow at most 5 Help_Messages per Visitor in a 24-hour window, and SHALL count them in a counter that is separate from the 15-inspections-per-day counter.
2. WHEN a Help_Message that is not a Trigger is blocked by the Help_Limit, THE Help_API SHALL respond with HTTP 429, the error `HELP_LIMIT_REACHED`, a `Retry-After` header and a friendly message, and SHALL save and send nothing.
3. THE Help_API SHALL NOT change the inspection counter, and THE inspection route SHALL NOT change the Help_Limit counter.
4. IF the Honeypot field has any value, THEN THE Help_API SHALL respond with the same success response as for a valid Help_Message, and SHALL save nothing, send nothing and leave the Help_Limit counter unchanged.
5. THE Help_API SHALL identify the Visitor with the existing mechanism (signed cookie, else hashed Trusted_Client_IP), and SHALL NOT store or log a raw IP address.
6. IF the Help_Limit counter cannot be read or written and the Help_Message is not a Trigger, THEN THE Help_API SHALL log only the error name and SHALL respond with HTTP 500, the error `ACTION_FAILED` and a friendly message, and SHALL save and send nothing.
7. THE Help_Form SHALL show a limit message as text and keep the typed values.
8. FOR ALL sequences of N valid Help_Messages from one Visitor within one 24-hour window, with or without a Trigger, THE Help_API SHALL save and send exactly min(N, 5) of them (property).
9. THE Help_API SHALL count a Help_Message that is a Trigger toward the Help_Limit in the same counter as every other Help_Message, with no bypass of the Help_Limit.
10. IF the Help_Message is a Trigger and the Help_Limit counter cannot be read or written, THEN THE Help_API SHALL log only the error name, respond with HTTP 200, the status `emergency` and the Emergency_Message, and save and send nothing.
11. FOR ALL Help_Messages that are a Trigger, THE Help_API SHALL respond with the Emergency_Message whether the Help_Limit is reached or not (property).

### Requirement 15: Help confirmation and wording

**User Story:** As a Visitor, I want to know my message went through and how we will answer, so that I am not left wondering.

#### Acceptance Criteria

1. WHEN the Help_API responds with success, THE Help_Form SHALL show the text "Thanks, we got your message. We'll reply by email." in an element with `role="status"`.
2. THE Help_Form SHALL show the text "We use your email only to reply to you." directly under the form.
3. THE Help_Form SHALL show the same confirmation for a saved message, for a message whose email failed and for a Honeypot-filled submission.
4. WHILE a Help_Message is being sent, THE Help_Form SHALL disable the submit button and show a text status, so that one click sends one Help_Message.

### Requirement 16: Page order, Pro job page

**User Story:** As a Pro_User, I want the job facts and the conversation before the booking controls, so that I decide with all the information.

#### Acceptance Criteria

1. THE Pro_Job_Page SHALL show its sections in this order from top to bottom: job facts, photos, Chat_Panel, the decline control, Booking_Controls, Help_Section.
2. WHILE the Job_Status is `accepted` or `booked`, THE Pro_Job_Page SHALL show the offered Time_Slots or the booked Time_Slot as the Booking_Controls in the last position before the Help_Section.
3. WHILE the Job_Status is `declined`, THE Pro_Job_Page SHALL show the decline reason and the read-only Chat_Panel, and SHALL NOT show Booking_Controls.
4. WHILE the Job_Status is `emergency`, THE Pro_Job_Page SHALL show the existing emergency view and no other section named in criterion 1.

### Requirement 17: Page order, Results page

**User Story:** As a Homeowner, I want to read the diagnosis and talk to the tradesperson before I am asked to pick a time, so that the page reads in a natural order.

#### Acceptance Criteria

1. THE Results_Page SHALL show its sections in this order from top to bottom: issue, cost, job brief, status, Chat_Panel, Booking_Controls, "Start a new inspection" link, Help_Section.
2. WHILE the Job_Status is `accepted`, THE Results_Page SHALL show the "Pick a time" control as the Booking_Controls; WHILE the Job_Status is `booked`, THE Results_Page SHALL show the booking confirmation as the Booking_Controls.
3. WHILE the Job_Status is `new`, `info_requested` or `declined`, THE Results_Page SHALL show no Booking_Controls.
4. WHILE the Job_Status is `emergency`, THE Results_Page SHALL show the existing emergency view and no Chat_Panel, Booking_Controls or Help_Section.

### Requirement 18: Haunted mode

**User Story:** As a User of the Haunted theme, I want the new screens to match it, so that the App feels the same everywhere, while the emergency rules stay as they are.

#### Acceptance Criteria

1. THE Chat_Panel, the Help_Section and the Help_Form SHALL take every colour from the existing Normal tokens and `haunted.*` tokens, and SHALL follow the active theme.
2. THE Chat_Panel and the Help_Form SHALL show their plain wording (labels, errors, limit messages, confirmation) identically in both themes.
3. WHILE the Haunted theme is active, THE Chat_Panel and the Help_Form SHALL meet the contrast ratios of `haunted-mode` Requirement 4, and THE new Colour_Pairs SHALL be listed in the Contrast_Registry.
4. WHEN a Homeowner Chat_Message produces the Emergency_Message, THE App SHALL follow the Emergency_Page rules of `haunted-mode`: the Normal theme is shown, the Haunted switch is hidden and the stored theme is unchanged.
5. THE Emergency_Message shown by the Chat_Panel or the Help_Form SHALL use the fixed high-contrast Emergency_Banner style with no `haunted:` classes.
6. THE new components SHALL add no animation and no transition, so that `haunted-mode` Requirement 10 still holds.
7. THE new components that sit in directories scanned by the Source_Scan_Test SHALL pass that test unchanged.

### Requirement 19: Accessibility

**User Story:** As a User who uses a keyboard or a screen reader, I want the chat and the help form to work for me, so that I can use them without a mouse.

#### Acceptance Criteria

1. THE Chat_Panel and the Help_Form SHALL give every field a visible `<label>` that is linked to the field.
2. THE Chat_Panel and the Help_Form SHALL work with the keyboard alone: every control SHALL be reachable with the Tab key in reading order and operable with Enter or Space, and SHALL show a focus indicator with a contrast ratio of at least 3:1.
3. WHEN a Chat_Message is sent, THE Chat_Panel SHALL keep keyboard focus in the message box, and SHALL clear the message box only after the Chat_API accepted the Chat_Message.
4. WHEN an error occurs in the Chat_Panel or the Help_Form, THE component SHALL show the error as text in an element with `role="alert"` and SHALL NOT convey the error by colour alone.
5. THE Chat_Panel SHALL expose the list of Chat_Messages as a labelled region, and each Chat_Message SHALL name its sender and time in text.
6. THE Chat_Panel and the Help_Form SHALL present controls with a touch target of at least 44 by 44 CSS pixels.
7. THE Chat_Panel and the Help_Form SHALL meet WCAG AA contrast (4.5:1 for body text and 3:1 for large text and non-text components) in the Normal and Haunted themes.
8. WHEN the Help_Form shows a field error, THE Help_Form SHALL move focus to the first invalid field, and SHALL link the error text to the field with `aria-describedby`.

### Requirement 20: Responsive layout

**User Story:** As a User on a phone or a desktop, I want the chat and the help form to fit my screen, so that I can read and type comfortably.

#### Acceptance Criteria

1. THE Chat_Panel and the Help_Form SHALL show all text, fields and buttons at a viewport width of 390 px without horizontal scrolling.
2. THE Chat_Panel and the Help_Form SHALL show all text, fields and buttons at viewport widths of 1280 px and wider without horizontal scrolling.
3. THE Chat_Panel SHALL keep long unbroken text inside its message bubble by wrapping it.
4. THE App SHALL NOT change the layout or styling of existing screens except for the reordering of Requirements 16 and 17, the addition of the Chat_Panel and the Help_Section, and the Results_Page_Notice text of Requirement 9, criterion 8.

### Requirement 21: Tests

**User Story:** As the owner of the App, I want the safety guarantees proven by tests, so that a later change cannot weaken them.

#### Acceptance Criteria

1. THE test suite SHALL extend Property 3 so that for every trigger phrase, every Open_Status and every other Job_Status, every Homeowner Chat_Message and every Help_Message that contains a Trigger ends in the Emergency_Message, and the Safety_Layer check is recorded before any DynamoDB or SES call.
2. THE test suite SHALL extend Property 5 so that no Pro_User Chat_Message, whatever its text, moves a Job to `emergency` and none runs the Safety_Layer.
3. THE test suite SHALL cover the status rules of Requirement 2 for every Job_Status and both Sides.
4. THE test suite SHALL cover the order of Chat_Messages, including Legacy_Messages and equal sent times.
5. THE test suite SHALL cover the Thread_Limit, the Message_Rate_Limit per Side and the Retry-After header.
6. THE test suite SHALL cover that no Chat_Panel, Chat_Message or message box is rendered, and no Chat_API read returns messages, for an Emergency_Job.
7. THE test suite SHALL cover the Help_Form's Honeypot (nothing saved or sent, same confirmation, with or without a Trigger) and the Help_Limit (5 per day, separate counter), including that a Trigger Help_Message counts toward the Help_Limit, that the Emergency_Message is returned over the Help_Limit with nothing saved or sent, and that the Emergency_Message is returned when the Help_Limit counter fails.
8. THE test suite SHALL cover the polling schedule (5 seconds, 30 seconds after 2 minutes, stopped for hidden tab, Chat_Read_Only and Emergency_Job) with fake timers.
9. THE test suite SHALL cover that Chat_Message text, Help_Message text and email addresses are never written to a log call.
10. THE test suite SHALL cover that the Help_Email holds no IP address or cookie, that an SES failure still gives the confirmation, and that header injection through the Name or the Email is neutralised.
11. THE test suite SHALL cover that the Privacy_Notice text equals the exact text of Requirement 9, criterion 5.
12. THE test suite SHALL cover that the page order of Requirements 16 and 17 holds in each Job_Status.
13. THE test suite SHALL cover that `amplify.yml` and `.env.example` name `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL` and hold no value for them, and that `@aws-sdk/client-sesv2` has the same version as the other `@aws-sdk` packages.
14. THE test suite SHALL use `fast-check` for the properties in Requirements 2, 5, 7, 11, 12 and 14, and mocks for AWS services, so that the tests make no real AWS call.
15. THE existing tests of `src/lib/safety/` and the Source_Scan_Test SHALL pass without change.
16. THE test suite SHALL cover that the Results_Page_Notice text equals exactly "Anyone with this page's link can see it and send messages in the chat. Your photos and messages are deleted after 30 days.", and that the Privacy_Notice still equals the text of Requirement 9, criterion 5.
17. THE test suite SHALL cover that a poll or a send response carries the Job_Status and the Booking_Data, and that the Status_Panel, the Booking_Controls and the Chat_Panel on the Results_Page, and the status text, the Booking_Controls and the Chat_Panel on the Pro_Job_Page, update in the same render (accept shows "Pick a time", booking shows the booked Time_Slot, within one chat poll).
18. THE test suite SHALL cover that a saved Chat_Message holds no `GSI1` attribute and does not appear in the Pro_User's job list.
19. THE test suite SHALL cover that the ask-info and reply routes and their tests still pass after the Switch_Over.
