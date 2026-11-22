# Implementation Plan: Chat and Help

## Overview

Implementation language: TypeScript (strict mode, Next.js App Router), as in the design. There are exactly seven parent tasks, in this order: (1) data and safety, (2) routes, (3) chat screens, (4) switch-over, (5) help form, (6) page order, (7) final checkpoint.

Each parent task is small and leaves the app working, so the work can stop and ship after any of them. Until task 4, no page mounts the Chat_Panel and the old ask-info and reply flow runs unchanged. Nothing in `src/lib/safety/`, `src/lib/emergency/messages.ts` or `src/components/sourceScan.test.ts` is changed in any task.

Test rules for every task:

- Property tests use `fast-check` with at least 100 runs and carry the comment `Feature: chat-and-help, Property <n>: <title>`. AWS is always mocked (the fake DynamoDB table, a mocked SES client).
- Every route-level property test sets a 30-second timeout (for example `it('...', async () => { ... }, 30_000)`), because Amplify runs the suite on a slower machine and a render-heavy property test timed out at 5 s there before. Each task below that holds such a test says so.
- Property tests for design Properties 1, 2, 3, 4, 5, 7, 9 and 14 are required. All other property tests are optional.
- The full existing suite passes at the end of every parent task.

## Tasks

- [x] 1. Data and safety: types, schema, pure rules, storage
  - [x] 1.1 Add chat types, schema fields and error codes
    - Create `src/types/chat.ts` with `CHAT_SIDES`, `ChatSide`, `ChatMessage`, `BookingData`, `ChatAccess`, `ChatReadResponse`, `ChatSendResponse`, `ChatEmergencyResponse`
    - In `src/types/job.ts` add `THREAD_LIMIT_REACHED`, `MESSAGE_RATE_LIMITED` and `HELP_LIMIT_REACHED` to `ApiErrorCode`, the optional `fields` to `ApiErrorBody`, and the four optional chat attributes to `JobRecord`
    - In `src/lib/jobs/copy.ts` add friendly texts for the three new error codes (the existing `satisfies Record<ApiErrorCode, ...>` forces them)
    - In `src/lib/validation/jobSchema.ts` add the four optional chat attributes and relax the `info_requested` rule so it applies only while `chatSeq` is 0 or absent (design D11)
    - In `src/lib/aws/dynamodb.ts` add the four chat attribute names to `STORAGE_ONLY_ATTRIBUTES`
    - Existing tests (including "fails info_requested without a question") pass unchanged
    - _Requirements: 1.1, 2.1, 2.2, 7.1, 7.2, 7.5, 9.1_

  - [x] 1.2 Implement the pure chat rules, limits, keys and TTL helpers
    - `src/lib/chat/rules.ts`: `chatAccess`, `statusAfterSend` (reusing `transition()` for `ask_info` and `reply`)
    - `src/lib/chat/limits.ts`: `THREAD_LIMIT`, `MESSAGE_RATE_MAX`, `MESSAGE_RATE_WINDOW_MS`, `checkSendLimits` (thread limit checked first, `retryAfterSeconds` at least 1)
    - `src/lib/chat/chatKeys.ts`: `CHAT_SK_PREFIX`, `CHAT_SK_MAX`, `chatSk`
    - `src/lib/aws/ttl.ts`: `THIRTY_DAYS_SECONDS`, `ttlForJob`, `ttlFromNow`
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 7.1, 7.2, 7.3, 7.5, 7.9_

  - [x] 1.3 Implement the pure thread, poll schedule and validation modules
    - `src/lib/chat/thread.ts`: `legacyToMessages`, `chatSortKey`, `mergeThread` (stable; ids `q-<i>`, `r-<i>`, `c-<seq>`)
    - `src/lib/chat/pollSchedule.ts`: `FAST_INTERVAL_MS`, `SLOW_INTERVAL_MS`, `QUIET_PERIOD_MS`, `pollDelayMs`
    - `src/lib/chat/validation.ts`: `chatSendBodySchema`, `chatAfterSchema` (integer 0 to 100), and the three response schemas
    - _Requirements: 1.3, 1.4, 1.6, 5.1, 6.1, 6.2, 6.12, 6.13_

  - [x] 1.4 Extract `resolveVisitorId` from the rate limiter without changing it
    - In `src/lib/rateLimiter.ts` export `resolveVisitorId(request)`, moved out of `checkRateLimit` with identical behaviour; `checkRateLimit` calls it
    - Do not change, rename or edit any existing rate-limiter test or the inspection route tests; run the existing rate-limiter tests (`rateLimiter` tests, `route.ratelimit.test.ts`, `route.ratelimit.spoof.test.ts`) unchanged and confirm they all pass
    - _Requirements: 14.5, 7.8_

  - [x] 1.5 Extend the fake DynamoDB table and job fixtures
    - In `src/test/fakeDynamoTable.ts` support `TransactWriteCommand` (`Put`, `Update`, `ConditionCheck`, all-or-nothing, `TransactionCanceledException` with `CancellationReasons`) and `QueryCommand` on the main table (`PK = :pk AND SK BETWEEN :lo AND :hi`, `ConsistentRead`, `Limit`, ascending); keep the guard that throws on other unsupported commands
    - In `src/test/jobFixtures.ts` add `makeChatItem` and options for the chat attributes
    - Existing tests that use the fake table pass unchanged
    - _Requirements: 21.14_

  - [x] 1.6 Implement `src/lib/aws/chat.ts`
    - `sendChatMessage`: one `TransactWriteCommand` with the message `Put` (no GSI1 attributes, `ttl = ttlForJob(createdAt)`) and the Job `Update` (conditions on status and `chatSeq`; status change only when `nextStatus` differs); map `ConditionalCheckFailed` and `TransactionConflict` to `{ ok: false, reason: 'CONDITION_FAILED' }`, rethrow anything else
    - `queryChatMessages`: consistent `Query` with `SK BETWEEN chatSk(after + 1) AND CHAT_SK_MAX`, mapped to `ChatMessage`
    - Guard with `server-only`; log only error names
    - _Requirements: 2.1, 2.2, 2.6, 7.5, 7.6, 7.11_

  - [x] 1.7 Write property test for the chat status rules (pure model)
    - **Property 4: Status rules for chat**
    - File `src/lib/chat/rules.property.test.ts`: any sequence of sends from either Side on an Open_Status gives the status obtained by applying one rule per message
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.7, 21.3**

  - [x] 1.8 Write property test for the chat limits (pure model)
    - **Property 7: Chat limits hold for every sequence**
    - File `src/lib/chat/limits.property.test.ts`: at most 100 messages per thread, at most 10 per Side per 60 s, separate per Side, thread limit wins over rate limit, `Retry-After` at least 1 and equal to the whole seconds until the oldest counted send leaves the window
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.9, 7.10, 21.5**

  - [ ]* 1.9 Write property test for thread order
    - **Property 6: Thread order is by time, stable, and includes legacy entries**
    - File `src/lib/chat/thread.property.test.ts`: sorted by `sentAt`, a permutation of the input, stable for equal times, batch merging equals one full merge, stored `infoRequests` and `replies` never modified
    - **Validates: Requirements 1.3, 1.4, 1.6, 9.4, 21.4**

  - [ ]* 1.10 Write property test for the poll schedule
    - **Property 11: The poll schedule is a function of time, visibility and state**
    - File `src/lib/chat/pollSchedule.property.test.ts`: `null` when access is not `open` or the tab is hidden, 30000 at or after 120000 ms of quiet, otherwise 5000
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6, 6.12, 21.8**

  - [x] 1.11 Write property test for chat storage
    - **Property 9: Stored messages stay out of the Job_Index and expire with the Job**
    - File `src/lib/aws/chat.storage.property.test.ts` using the fake table: every chat item has `PK = JOB#<id>`, `SK = CHAT#<6 digits>`, no `GSI1PK` and no `GSI1SK`; a `GSI1` query returns only Job items; each chat item's `ttl` equals `ttlForJob(createdAt)`, which equals the `ttl` that `persistInspection` writes for the same `createdAt`
    - Set a 30-second timeout on the property test
    - **Validates: Requirements 7.5, 7.11, 21.18**

  - [ ]* 1.12 Write unit tests for the schema change and pure helpers
    - D11: `info_requested` with `chatSeq > 0` and no `infoRequests` parses; with `chatSeq` absent it still fails
    - `getInspection` does not return the four chat attributes
    - `chatSk` padding, `ttlForJob`, `chatAccess` for all six statuses
    - _Requirements: 1.6, 3.1, 3.2, 3.3, 7.5_

  - [x] 1.13 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 2. Routes: chat read and send for both Sides
  - [ ] 2.1 Implement the shared chat pipelines and booking data
    - `src/lib/chat/chatRoute.ts` (`server-only`): `runChatSend` and `runChatRead` following the design pipelines (limits, one conditional transaction, one re-read then `conflictResponse`)
    - Homeowner send: `readJsonBody(request, 4096)`, then `replyTriggersEmergency` on the full untrimmed text before the id check and every DynamoDB call; on a Trigger call `applySafetyOverride(id, '', nowIso)` in a try block, swallow errors (log the error name only) and answer 200 with `EMERGENCY_MESSAGE`
    - Pro send: `requirePro` first; no import of `replyCheck` or `safetyLayer`
    - Closed chat: 409 `JOB_IS_EMERGENCY` (`EMERGENCY_MESSAGE` for the Homeowner, `PRO_EMERGENCY_NOTE` for the Pro_User) and 409 `ILLEGAL_TRANSITION` for `declined`
    - Add `toBookingData` to `src/lib/jobs/views.ts`; every success response carries `status` and `booking`
    - Every response uses `noStoreJson`; the pipelines never import `@/lib/rateLimiter` or `@/lib/aws/bedrock`
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 3.4, 3.5, 3.6, 3.9, 4.1, 4.2, 4.3, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.11, 6.13, 7.1, 7.2, 7.6, 7.7, 7.8, 8.1, 8.4_

  - [ ] 2.2 Add the Homeowner chat route
    - `src/app/api/inspections/[id]/chat/route.ts` exporting `GET` and `POST`, `runtime = 'nodejs'`, Side fixed to `homeowner` on the server, authorised by the Job id only
    - _Requirements: 3.9, 8.3, 8.4, 7.7_

  - [ ] 2.3 Add the Pro chat route
    - `src/app/api/pro/jobs/[id]/chat/route.ts` exporting `GET` and `POST`, Side fixed to `tradesperson`, `requirePro` before parsing the body, validating the id or calling DynamoDB; the fail-closed rules of `pro-dashboard-and-booking` apply
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 4.7_

  - [ ] 2.4 Write property test for Homeowner chat safety
    - **Property 1: Homeowner chat is safety first (extends Property 3)**
    - File `src/app/api/inspections/[id]/chat/chat.safety.property.test.ts`: any Trigger, any target, thread size 0 to 100, any rate-limit state, any injected DynamoDB failure gives 200 `emergency` and exactly `EMERGENCY_MESSAGE`; the Safety_Layer check is logged before any DynamoDB command; no `CHAT#` item is written; the Trigger text appears in no stored attribute; the Job override fields are correct
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6, 4.8, 21.1**

  - [ ] 2.5 Write property test for Pro chat messages
    - **Property 3: Pro chat messages never touch safety state (extends Property 5)**
    - File `src/app/api/pro/jobs/[id]/chat/proChat.property.test.ts`: any text and any status never calls the Safety_Layer, never sets `emergency`, and ends as a saved message with the rule status or a 409 for `declined` and `emergency`
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 4.7, 21.2**

  - [ ] 2.6 Write property test for chat status rules through the routes
    - **Property 4: Status rules for chat**
    - File `src/app/api/inspections/[id]/chat/chatStatus.route.property.test.ts`: sequences of sends from both Sides through the routes and the fake table; stored status equals the model and the stored thread length equals the number of accepted messages (status and message written in one transaction)
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.7, 21.3**

  - [ ] 2.7 Write property test for closed chats
    - **Property 5: A closed chat stays closed**
    - File `src/app/api/chat.closed.property.test.ts`: `declined` gives 409 `ILLEGAL_TRANSITION` and `emergency` gives 409 `JOB_IS_EMERGENCY` for either Side and any non-Trigger text, nothing saved; reads of an emergency Job return 409 and no message; any sequence of sends, Trigger sends and Pro actions leaves an emergency Job in `emergency`
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 4.4, 21.6**

  - [ ] 2.8 Write property test for chat limits through the routes
    - **Property 7: Chat limits hold for every sequence**
    - File `src/app/api/inspections/[id]/chat/chatLimits.route.property.test.ts`: sequences of sends with injected clock never exceed 100 stored messages or 10 per Side per 60 s; the `Retry-After` header equals the model; the thread limit response wins when both apply
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.9, 7.10, 21.5**

  - [ ] 2.9 Write property test for the Pro cookie requirement
    - **Property 10 (Pro cookie part only): The Pro routes need the cookie**
    - Add a cookie case to `src/app/api/pro/jobs/[id]/chat/proChat.property.test.ts`: missing or invalid `hhi_pro` gives 401 `UNAUTHORIZED` and zero DynamoDB calls, for GET and POST. The Side-from-route part (`chat.side.property.test.ts`) is skipped
    - Set a 30-second timeout on each route-level property test
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [ ]* 2.10 Write property test for chat response contents
    - **Property 12: Every successful chat response carries status and booking data**
    - File `src/app/api/chat.response.property.test.ts`: every 200 GET or POST response has the Job's status after the request and `booking` equal to `toBookingData`
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 6.13, 21.17**

  - [ ]* 2.11 Write route example tests and the no-rate-limiter test
    - Status rules per status and Side; first-message status change in one transaction; one re-read then conflict; 404 cases; 413 at 4 KB; `Retry-After` header; `Cache-Control: no-store` on every outcome
    - `src/app/api/chatNoRateLimiter.test.ts` (modelled on `noRateLimiter.test.ts`): chat routes never import the rate limiter and never write `RATELIMIT#` items
    - _Requirements: 2.6, 3.9, 5.11, 7.7, 7.8, 21.3_

  - [ ] 2.12 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Chat screens: hook and components, not mounted
  - [ ] 3.1 Add the view helpers
    - In `src/lib/jobs/views.ts` add `viewFromChat(status, booking)` and `toProEmergencyDetail(job)` as pure functions
    - _Requirements: 3.8, 6.14, 6.15_

  - [ ] 3.2 Implement `src/hooks/useChatThread.ts`
    - One initial GET without `after` (none when access is `closed`), then a timer chain using `pollDelayMs`; one in-flight check at a time; one immediate check when the tab becomes visible; cursor moves only with GET `lastSeq`
    - After a successful send, merge the saved message and run one poll at once
    - Call `onJobChange` only when status or booking differ; call `onEmergency` once on 409 `JOB_IS_EMERGENCY` or a 200 emergency body and clear the messages; call `onUnauthorized` on 401; a 409 `ILLEGAL_TRANSITION` on send passes the current status to `onJobChange`
    - Status-only changes do not reset the interval or the Quiet_Period; cancel every timer and request on unmount; no `WebSocket` or `EventSource`
    - _Requirements: 3.7, 3.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.14, 6.15, 6.18, 6.19_

  - [ ] 3.3 Implement the Chat_Panel components
    - `src/components/ui/chat/ChatPanel.tsx`, `ChatMessageList.tsx`, `ChatBubble.tsx`, `ChatComposer.tsx`
    - Loading line, open, read-only (history and one text line, no box or button), closed (renders `null`), empty text, error and limit text in `role="alert"`; labelled `<ol>`; sender labels ("You", "Homeowner", "Tradesperson"); `<time>` through `TimeText`; text in one `whitespace-pre-wrap break-words` element; polite live region silent on first load
    - Textarea never disabled while sending; button disabled instead; clear text and refocus only after success; keep text and focus after a refusal; `min-h-11` controls; colours only from `styles.ts`; no `transition`, `animate` or `duration` classes; avoid string literals that are exactly CSS colour names (Source_Scan_Test)
    - _Requirements: 3.1, 3.2, 3.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 7.4, 18.1, 18.2, 18.5, 18.6, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 20.1, 20.2, 20.3_

  - [ ] 3.4 Add Contrast_Registry rows for the chat colour pairs
    - Add any pair the chat components use that is not already listed; add a registry test that lists the pairs used by the chat components and asserts each row exists and passes
    - _Requirements: 18.3, 19.7_

  - [ ] 3.5 Write hook tests with fake timers
    - 5 s polling; 30 s after 2 minutes; back to 5 s on a new message or a send; stopped for a hidden tab, `read_only` and `emergency`; one immediate check on visible; no overlapping checks; a failed check keeps messages; unmount cancels timers and requests; a status-only change keeps the interval
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 6.10, 6.11, 6.18, 21.8_

  - [ ]* 3.6 Write component tests for the Chat_Panel
    - States (loading, open, read only, empty, error, limit message), labels, `<time>` and zone name, live region silent on first load, focus kept after send and after refusal, text cleared only after success, no markup rendered for `emergency`
    - _Requirements: 3.2, 3.3, 5.5, 5.6, 5.8, 5.9, 7.4, 19.3, 19.4, 21.6_

  - [ ]* 3.7 Write property test for chat text round trip
    - **Property 8: Chat text is trimmed, bounded, and round-trips**
    - File `src/lib/chat/chatText.property.test.ts`: any string with trimmed length 1 to 500 is saved trimmed and its rendered bubble `textContent` equals it (markup characters and line breaks included); empty or over-500 trimmed text gives 400 `INVALID_REQUEST` and nothing saved
    - Set a 30-second timeout on this render-heavy and route-level property test
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.10**

  - [ ]* 3.8 Write smoke tests for the unmounted state
    - Until task 4, no non-test file imports `ChatPanel`; `useChatThread` source contains no `WebSocket` or `EventSource`; `sourceScan.test.ts` and `src/lib/safety/` tests pass unchanged and the scan covers the new files in `src/components/ui/`
    - _Requirements: 6.8, 9.2, 18.7, 21.15_

  - [ ] 3.9 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Switch-over: replace the question form and reply box with the chat
  - [ ] 4.1 Move the Results_Page_Notice into `copy.ts` and use it from there
    - The line exists today as inline text in `src/components/results/ResultsView.tsx`: "Anyone with this page's link can view it. Your photos are deleted after 30 days." It stays unchanged until this task
    - In this task add the new text to `src/lib/jobs/copy.ts` as an exported constant: "Anyone with this page's link can see it and send messages in the chat. Your photos and messages are deleted after 30 days."
    - Replace the inline text in `ResultsView.tsx` with the constant from `copy.ts`
    - Add the exact-text test (the rendered Results_Page_Notice equals the string above, and appears only on the Results_Page); update the existing assertions that expect the old inline text
    - _Requirements: 9.8, 9.9, 21.16_

  - [ ] 4.2 Update the Privacy_Notice text
    - Change `DATA_SHARING_NOTICE_TEXT` in `src/components/upload/DataRetentionNotice.tsx` to: "Your photos, answers and messages are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days."
    - Add the exact-text test; update the existing assertions on the old text; the text appears only where `DataRetentionNotice` is shown
    - _Requirements: 9.5, 9.9, 21.11, 21.16_

  - [ ] 4.3 Switch the Results page to the Chat_Panel
    - Lift `useStatusPolling` into `ResultsView`; split `StatusPanel` into `StatusPanelBody` (props: `polling`) and a thin wrapper that still calls the hook itself when no `polling` prop is given, so its existing tests pass unchanged
    - Mount `ChatPanel` (`side="homeowner"`) with `onJobChange` calling `polling.applyView(viewFromChat(...))` and `onEmergency` applying the emergency view; remove the `ReplyBox` block, its state and the "unsent reply" notice
    - Status text, booking controls and chat panel read the same `polling.view`, so they update in one render; the Chat_Panel is removed in the same render as the emergency view
    - _Requirements: 1.2, 1.5, 3.3, 3.8, 4.5, 6.14, 6.16, 9.3, 9.4, 9.6_

  - [ ] 4.4 Switch the Pro job page to the Chat_Panel
    - Add `applyLive(next)` to `useProJob` (one `setState`; patches status and booking; `emergency` replaces the job with `toProEmergencyDetail(job)` in the same update)
    - In `JobDetail` mount `ChatPanel` (`side="tradesperson"`) with `onJobChange={applyLive}`, an `onEmergency` that applies the emergency detail, and the existing `handleUnauthorized` for 401; remove `AskInfoForm`, `JobHistory` and the `info_requested` case of `StatusBlock`
    - While the status is `info_requested`, show the text "Waiting for the homeowner's reply"
    - The ask-info and reply routes, `applyReply`, `applyTransition` for `ask_info` and all their tests stay in place
    - _Requirements: 1.2, 1.5, 2.4, 3.3, 3.8, 4.5, 6.15, 6.17, 9.3, 9.6_

  - [ ] 4.5 Replace only the tests of the removed screens
    - Remove the tests of `ReplyBox`, `AskInfoForm` and `JobHistory`, each replaced by the equivalent Chat_Panel or page test from tasks 3 and 4
    - Remove the "no non-test file imports `ChatPanel`" smoke test from task 3.8, which no longer holds
    - Do not edit any test of the ask-info and reply routes; confirm they still pass
    - _Requirements: 9.6, 9.7, 21.19_

  - [ ] 4.6 Write integration tests for the live page updates
    - Results page: accept shows "Pick a time" within one chat poll; status text, booking controls and chat panel change in the same render; a 409 `JOB_IS_EMERGENCY` removes the panel in the same render as the emergency view
    - Pro page: booking shows the booked Time_Slot within one chat poll; old questions and replies appear as the first messages of the thread
    - _Requirements: 3.7, 3.8, 6.14, 6.15, 6.16, 6.17, 9.4, 21.17_

  - [ ] 4.7 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Help form: contact section, safety, saving and email
  - [ ] 5.1 Add the SES package pin and configuration names
    - Add `"@aws-sdk/client-sesv2": "3.1163.0"` (exact, same as the other `@aws-sdk` packages) to `package.json` and update `package-lock.json` with `npm install`; add no other package
    - Append `-e CONTACT_FROM_EMAIL -e CONTACT_TO_EMAIL` to the `env | grep` line in `amplify.yml`; add the two names with a one-line comment each and no value to `.env.example`
    - _Requirements: 13.9, 13.10_

  - [ ] 5.2 Implement the pure help modules
    - `src/lib/help/schema.ts`: `HELP_PAGES`, `HelpPage`, `helpLooseBodySchema`, `helpBodySchema`, `HELP_FIELD_MESSAGES`
    - `src/lib/help/email.ts`: `stripLineBreaks`, `buildHelpEmail`, `HELP_SUBJECT`, `HELP_SUBJECT_EMERGENCY` (fixed subject, no IP or cookie, no CR or LF in headers)
    - `src/lib/help/record.ts`: `toHelpRecord`, `helpKey`, `HelpRecord`
    - `src/lib/help/copy.ts`: heading, confirmation, privacy line, field labels
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.8, 13.2, 13.4, 13.5, 15.1, 15.2_

  - [ ] 5.3 Implement the SES client and the Help_Record writer
    - `src/lib/aws/ses.ts` (`server-only`): `getSesClient` singleton using `APP_AWS_REGION` and the default credential chain; `sendHelpEmail` with the From, To, Reply-To and fixed subject; throws `MissingConfigError` when either address variable is unset
    - `src/lib/aws/help.ts` (`server-only`): `saveHelpRecord` under `HELP#<uuid>` with no GSI1 attributes and `ttlFromNow`
    - _Requirements: 13.1, 13.3, 13.6, 13.11_

  - [ ] 5.4 Implement the Help pipeline and route
    - `src/lib/help/handleHelp.ts` following the design: `readJsonBody(request, 8192)`, loose parse, Safety_Layer on Message and on Name checked separately, Honeypot, strict parse, `resolveVisitorId` then `incrementRateLimitCounter('help:' + id, now, 5, 24 h)`, save and send each in their own try block
    - A Trigger always gets 200 with `EMERGENCY_MESSAGE`, even when validation, counting, saving or sending fails; a non-Trigger gets 400, 429 with `Retry-After`, or 500 `ACTION_FAILED` only when both save and send fail; never changes a Job_Status; never calls `checkRateLimit`
    - `src/app/api/help/route.ts` exports `POST` with `noStoreJson`; log only error names
    - _Requirements: 11.6, 11.7, 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 13.1, 13.3, 13.6, 13.7, 13.8, 13.12, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.9, 14.10_

  - [ ] 5.5 Implement the Help components and hook
    - `src/hooks/useHelpForm.ts`: values, field errors, phase (`idle`, `sending`, `sent`, `emergency`, `error`), first-invalid-field focus, values kept on failure and cleared after a confirmation
    - `src/components/ui/help/HelpSection.tsx` and `HelpForm.tsx` using `TextField`, `TextAreaField` and `Button`; heading "Need help? Contact us"; Honeypot input named `website` with `tabIndex={-1}`, `autoComplete="off"` and an `aria-hidden` off-screen wrapper carrying a `focus-visible:` class; privacy line under the form; confirmation in `role="status"`; `EmergencyBanner` on a Trigger with no `haunted:` classes and no confirmation; button disabled and a text status while sending
    - Add any new Contrast_Registry rows first, then extend the registry test
    - _Requirements: 10.1, 11.1, 11.4, 11.5, 11.9, 12.3, 14.7, 15.1, 15.2, 15.3, 15.4, 18.1, 18.2, 18.3, 18.5, 18.6, 19.1, 19.2, 19.4, 19.6, 19.8, 20.1, 20.2_

  - [ ] 5.6 Mount the Help_Section on every page
    - `src/app/page.tsx`: `<HelpSection page="/" />` after `UploadFlow`
    - `ResultsView`: `<HelpSection page="/inspect" jobId={id} />` in the normal, not-found and error branches, never in the loading or emergency branch, below the "Start a new inspection" link, removed in the same render as an emergency
    - `ProDashboard`: `<HelpSection page="/pro" />` at the bottom of every view, including the access code form
    - `JobDetail`: `<HelpSection page="/pro/jobs" jobId={id} />` in every phase except `loading` and the emergency view
    - Exactly one Help_Section per page
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ] 5.7 Write property test for Help safety
    - **Property 2: Help messages are safety first (extends Property 3)**
    - File `src/app/api/help/help.safety.property.test.ts`: any Trigger in Message or Name, any Honeypot value, any limit state, any counter, table or SES failure, any field validity gives 200 `emergency` and exactly `EMERGENCY_MESSAGE`; the Safety_Layer check is logged before any DynamoDB or SES call; no Job_Status changes; nothing saved or sent when the Honeypot is filled, the limit is reached, the counter fails or fields are invalid; otherwise one Help_Record and one Help_Email, both marked as emergency, and one counter increment
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 12.8, 14.10, 14.11, 21.1, 21.7**

  - [ ] 5.8 Write property test for the Help limit
    - **Property 14: The Help_Limit counts every saved message and ignores bots**
    - File `src/app/api/help/help.limit.property.test.ts`: N valid messages from one Visitor in one 24-hour window, with or without Triggers, save and send exactly min(N, 5); blocked non-Trigger messages get 429 with `Retry-After`; the inspection counter never changes; any non-empty Honeypot gives the normal success (or the Emergency_Message for a Trigger) with nothing saved, sent or counted
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 14.1, 14.2, 14.4, 14.8, 14.9, 15.3**

  - [ ]* 5.9 Write property test for Help validation and round trip
    - **Property 13: Help input validation and round trip**
    - Files `src/lib/help/schema.property.test.ts` and `src/app/api/help/help.roundtrip.property.test.ts`: acceptance exactly when the rules hold; the stored Help_Record equals the trimmed input; rejected non-Trigger input gives 400 `INVALID_REQUEST` with failing field names and nothing saved, sent or counted
    - Set a 30-second timeout on the route-level property test
    - **Validates: Requirements 11.2, 11.3, 11.6, 11.7, 11.8, 11.10, 13.1, 13.2**

  - [ ]* 5.10 Write property test for Help emails
    - **Property 15: Help emails hold the facts and no injected headers**
    - File `src/lib/help/email.property.test.ts`: the body holds Message, Name, Email, Side, page, Job id and the emergency mark, and no IP address, Hashed_IP or cookie value; the subject is exactly `HELP_SUBJECT` or `HELP_SUBJECT_EMERGENCY`; no header value contains CR or LF
    - **Validates: Requirements 13.3, 13.4, 13.5, 21.10**

  - [ ]* 5.11 Write property test that visitor text is never logged
    - **Property 16: Visitor text is never logged**
    - File `src/app/api/chat.logging.property.test.ts` covering the chat and help routes: with injected failures, `console.log`, `console.warn` and `console.error` never receive the text, name, email, `CONTACT_FROM_EMAIL` or `CONTACT_TO_EMAIL`; only error names
    - Set a 30-second timeout on this route-level property test
    - **Validates: Requirements 7.6, 13.8, 21.9**

  - [ ] 5.12 Write Help example, component and smoke tests
    - Honeypot with and without a Trigger; counter independent of the inspection counter; SES failure still confirms; both failing gives 500; missing env keeps the record; SES command region and addresses; no IP or cookie in the record or email
    - HelpForm labels, errors with focus on the first invalid field and `aria-describedby`, disabled while sending, `role="status"` confirmation, Emergency_Banner with no confirmation, values kept on failure; one Help_Section per page and none in emergency views, removed in the same render as an emergency
    - Smoke: `amplify.yml` and `.env.example` name the two variables with no value; `@aws-sdk/client-sesv2` version equals the other `@aws-sdk` versions
    - _Requirements: 10.2, 10.3, 10.5, 11.9, 12.3, 12.5, 13.6, 13.7, 13.9, 13.10, 14.3, 15.1, 15.4, 19.8, 21.7, 21.10, 21.13_

  - [ ] 5.13 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Page order: booking controls below the chat
  - [ ] 6.1 Extract `BookingControls` on the Results page
    - Create `src/components/results/BookingControls.tsx` holding the slot picker, the booking request and the confirmation moved out of `StatusPanel`
    - `StatusPanel` renders it itself unless `hideBooking` is set, so its existing tests pass unchanged
    - _Requirements: 17.2, 17.3_

  - [ ] 6.2 Extract `useProActions`
    - Create `src/hooks/useProActions.ts` returning `{ pending, message, send }` with the request logic moved out of `ActionPanel`; `ActionPanel` stays as a thin wrapper so its tests pass unchanged
    - _Requirements: 16.1_

  - [ ] 6.3 Reorder the Results page
    - `ResultsView` order: heading and urgency, issue, cost, job brief, `StatusPanel` (with `hideBooking`), `ChatPanel`, `BookingControls`, the two notes, "Start a new inspection", `HelpSection`
    - "Pick a time" only for `accepted`, the confirmation only for `booked`, no controls for `new`, `info_requested` and `declined`; the emergency view stays as it is
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 20.4_

  - [ ] 6.4 Reorder the Pro job page
    - `JobDetail` order: job facts, photos, `ChatPanel`, decline control (or the decline reason when declined), booking controls (accept form for `new` and `info_requested`, offered or booked slots for `accepted` and `booked`, none for `declined`), `HelpSection`
    - The emergency view stays as it is
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 20.4_

  - [ ] 6.5 Write page order tests
    - Results page order and Pro page order for each of the six statuses; accept shows "Pick a time" within one poll; booking shows the booked Time_Slot on the Pro page within one poll
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3, 17.4, 21.12, 21.17_

  - [ ] 6.6 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Run `next lint`, `tsc --noEmit` and the full test suite (`vitest --run`); confirm the `src/lib/safety/` tests, `sourceScan.test.ts`, the rate-limiter tests and the ask-info and reply route tests pass unchanged
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Property tests for Properties 1, 2, 3, 4, 5, 7, 9 and 14 are required and not marked optional.
- Each task references specific requirements for traceability.
- Route-level property tests use a 30-second timeout (Amplify's build machine is slower).
- Manual steps outside the task list (not coding tasks): add the `dynamodb:Query` and `ses:SendEmail` statements to the Amplify compute role, verify the SES identities in `us-east-2`, and send one real Help_Message after deploy.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.8", "1.9", "1.10", "1.12"] },
    { "id": 3, "tasks": ["1.11"] },
    { "id": 4, "tasks": ["1.13"] },
    { "id": 5, "tasks": ["2.1"] },
    { "id": 6, "tasks": ["2.2", "2.3"] },
    { "id": 7, "tasks": ["2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11"] },
    { "id": 8, "tasks": ["2.12"] },
    { "id": 9, "tasks": ["3.1", "3.2"] },
    { "id": 10, "tasks": ["3.3"] },
    { "id": 11, "tasks": ["3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 12, "tasks": ["3.9"] },
    { "id": 13, "tasks": ["4.1", "4.2"] },
    { "id": 14, "tasks": ["4.3", "4.4"] },
    { "id": 15, "tasks": ["4.5", "4.6"] },
    { "id": 16, "tasks": ["4.7"] },
    { "id": 17, "tasks": ["5.1", "5.2"] },
    { "id": 18, "tasks": ["5.3", "5.5"] },
    { "id": 19, "tasks": ["5.4", "5.6"] },
    { "id": 20, "tasks": ["5.7", "5.8", "5.9", "5.10", "5.11", "5.12"] },
    { "id": 21, "tasks": ["5.13"] },
    { "id": 22, "tasks": ["6.1", "6.2"] },
    { "id": 23, "tasks": ["6.3", "6.4"] },
    { "id": 24, "tasks": ["6.5"] },
    { "id": 25, "tasks": ["6.6"] },
    { "id": 26, "tasks": ["7"] }
  ]
}
```
