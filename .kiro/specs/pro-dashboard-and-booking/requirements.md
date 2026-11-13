# Requirements Document

## Introduction

The pro-dashboard-and-booking feature adds a tradesperson side to Haunted House Inspector and a booking loop for the homeowner. A tradesperson opens `/pro`, enters a shared demo access code, and sees the newest 50 jobs. For each job the tradesperson can read the diagnosis, the homeowner's answers and the photos, then accept the job (offering 1 to 3 time slots), decline it (with an optional reason), or ask the homeowner one question. The homeowner follows the outcome on the existing `/inspect/[id]` page: the page shows the job status in plain words, lets the homeowner answer a question, and lets the homeowner pick one of the offered time slots to confirm a booking.

This feature builds on the `intake-and-triage` spec. It reuses the job record, the single DynamoDB table, the signed-cookie and hashed-IP approach of the rate limiter, the Safety_Layer, the Results_Page and its components, and the theme classes and design tokens.

This feature deliberately extends two lines in `product.md`. The "Out of scope (v1)" list there excludes booking, and the user journey mentions viewing past inspections "if signed in". The user chose to add booking and tradesperson (Pro) access for this feature. There are still no accounts: the homeowner is authorised only by knowing the unguessable job id, and the tradesperson is authorised only by a shared access code that produces a short-lived signed cookie.

Because tradespeople can now view a job's photos and answers, the privacy notice on the upload page changes (Requirement 17), and the way the App identifies a client address is tightened for both the Pro_Auth lockout and the existing rate limiter (Requirement 18).

Safety overrides everything in this feature. The rules in `safety.md` and Requirement 6 and 11 of `intake-and-triage` still apply. Any homeowner free text (a reply) runs through the Safety_Layer first. A job that becomes an emergency stays an emergency for good, and the homeowner sees only the emergency guidance.

### Route summary

| Route | Method | Caller | Auth | Purpose |
|---|---|---|---|---|
| `/pro` | page | Pro_User | none (page); API checks cookie | Access code form, then job list |
| `/pro/jobs/[id]` | page | Pro_User | none (page); API checks cookie | Job detail and actions |
| `/api/pro/login` | POST | Pro_User | none (rate-limited by Lockout_Counter) | Check Access_Code, set Pro_Cookie |
| `/api/pro/logout` | POST | Pro_User | none | Clear Pro_Cookie |
| `/api/pro/jobs` | GET | Pro_User | Pro_Cookie | List newest 50 jobs |
| `/api/pro/jobs/[id]` | GET | Pro_User | Pro_Cookie | Job detail with pre-signed photo URLs |
| `/api/pro/jobs/[id]/accept` | POST | Pro_User | Pro_Cookie | Accept with 1 to 3 Time_Slots |
| `/api/pro/jobs/[id]/decline` | POST | Pro_User | Pro_Cookie | Decline with optional reason |
| `/api/pro/jobs/[id]/ask-info` | POST | Pro_User | Pro_Cookie | Ask the homeowner one question |
| `/api/inspections/[id]/status` | GET | Homeowner | job id only | Homeowner-safe status view |
| `/api/inspections/[id]/reply` | POST | Homeowner | job id only | Answer an Info_Request |
| `/api/inspections/[id]/book` | POST | Homeowner | job id only | Pick an offered Time_Slot |

The existing `GET /api/inspections/[id]` route is unchanged.

## Glossary

- **App**: The Haunted House Inspector Next.js web application.
- **Homeowner**: A User of the App who created a Job and follows it on the Results_Page; authorised only by knowing the Job id.
- **Pro_User**: A tradesperson using the Pro_Dashboard; has no account and is authorised only by a valid Pro_Cookie.
- **Access_Code**: The shared demo secret held in the `PRO_ACCESS_CODE` environment variable.
- **Pro_Cookie**: The cookie named `hhi_pro`, HttpOnly, Secure, SameSite=Strict, valid for 12 hours, holding a payload and its HMAC-SHA256 signature made with `SESSION_SECRET`.
- **Pro_Auth**: The server-side module that checks the Access_Code, applies the Lockout_Counter, and signs and verifies the Pro_Cookie.
- **Pro_API**: The Route Handlers under `app/api/pro/`.
- **Pro_Dashboard**: The pages `/pro` and `/pro/jobs/[id]`.
- **Job_Detail**: The Pro_Dashboard page `/pro/jobs/[id]` (the "Job_Detail page").
- **Homeowner_API**: The Route Handlers `GET /api/inspections/[id]/status`, `POST /api/inspections/[id]/reply` and `POST /api/inspections/[id]/book`.
- **Status_Panel**: The Client Component on the Results_Page that shows the Job_Status, the Info_Request question, the reply box, the offered Time_Slots and the Booking confirmation to the Homeowner.
- **Lockout_Counter**: The DynamoDB item `PROAUTH#<ipHash>` that counts login attempts from one Hashed_IP in a fixed 15-minute window.
- **Hashed_IP**: The one-way keyed hash of the Trusted_Client_IP (HMAC-SHA256 with `SESSION_SECRET`, hex-encoded); the raw IP address is never stored or logged.
- **Trusted_Client_IP**: The client address returned by `getTrustedClientIp`, taken only from the header entry that the CDN in front of the App adds (Requirement 18), or the constant `unknown` when no trusted value exists.
- **getTrustedClientIp**: The shared pure function `getTrustedClientIp(headers)` in `src/lib/` that returns the Trusted_Client_IP; it performs no I/O and has no AWS or `server-only` dependency.
- **Trusted_Proxy_Hops**: The single documented constant that says how many proxy entries the App trusts when it reads `x-forwarded-for` (Requirement 18).
- **Data_Retention_Notice**: The `DataRetentionNotice` component of `intake-and-triage` that shows the upload privacy text before submit; its text is changed by Requirement 17.
- **Status_Safety_Line**: The exact text "If something changes, start a new inspection. If you smell gas, see sparks or hear a CO alarm, leave the home and call 911." shown by the Status_Panel in `booked` and `declined` (Requirement 8, criterion 19).
- **Job**: One stored Inspection_Result (item `JOB#{id}`) together with its Job_Status and booking data.
- **Job_Status**: One of `new`, `info_requested`, `accepted`, `declined`, `booked`, `emergency`.
- **Terminal_Status**: A Job_Status from which no Status_Transition leaves except the safety override: `declined`, `booked`, `emergency`.
- **Status_Transition**: A change of Job_Status triggered by a Job_Action.
- **Job_Action**: One of `accept`, `decline`, `ask_info` (by the Pro_User), `reply`, `book` (by the Homeowner), or `safety_override` (by the Safety_Layer).
- **Transition_Function**: The pure function that takes a current Job_Status and a Job_Action and returns either the next Job_Status or a rejection; it performs no I/O.
- **Time_Slot**: A proposed appointment start time, an ISO 8601 UTC string with a `Z` suffix; a Time_Slot has a start only and no duration.
- **Info_Request**: One question from the Pro_User to the Homeowner (max 300 characters). At most one Info_Request is pending at a time: while the Job_Status is `info_requested`, the Pro_User cannot ask another.
- **Reply**: The Homeowner's answer to an Info_Request (max 500 characters).
- **Booking**: The Homeowner's choice of one offered Time_Slot, which moves the Job to `booked`.
- **Job_Index**: The sparse DynamoDB global secondary index named `GSI1` that contains only Job items.
- **Emergency_Job**: A Job whose Job_Status is `emergency`.
- **Emergency_Message**: The exact text "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside."
- **Pro_Emergency_Note**: The exact text "Emergency: the homeowner was told to call 911".
- **Safety_Layer**: The server-side module in `lib/safety/safetyLayer.ts`; its `checkEmergency` function evaluates text for Emergency_Trigger conditions (as defined in `intake-and-triage`).
- **Emergency_Trigger**: Any of the four conditions GAS_SMELL, ELECTRICAL_FIRE, WATER_ELECTRICAL, CO_ALARM defined in criterion 6.2 of `intake-and-triage`.
- **Session_Cache**: The browser `sessionStorage` entry keyed `hhi_result_{id}` defined in `intake-and-triage`.
- **Job_Store**: The server-side module `lib/aws/dynamodb.ts`, extended by this feature.
- **Plain_Text**: Text rendered as escaped characters, never as HTML.
- **Results_Page**: The page at `/inspect/[id]`, extended by this feature.

---

## Requirements

### Requirement 1: Pro Access Code Login

**User Story:** As a Pro_User, I want to enter a shared access code on `/pro`, so that I can reach the tradesperson dashboard without creating an account.

#### Acceptance Criteria

1. WHEN a visitor opens `/pro` and the Pro_API responds with HTTP 401 to the first `GET /api/pro/jobs` request, THE Pro_Dashboard SHALL display a form with one visible `<label>`-linked access code field (masked input, `maxlength` 200) and one submit button labelled "Enter".
2. WHEN the Pro_User submits the form, THE Pro_Dashboard SHALL send the code to `POST /api/pro/login` as a JSON body of the form `{ "code": <string> }`, and THE Pro_API SHALL validate the body with Zod as a string of 1 to 200 characters, applying no trimming to the code.
3. THE Pro_Auth SHALL compare the submitted code with the Access_Code by hashing both with SHA-256 and comparing the two 32-byte digests with `crypto.timingSafeEqual`, so that the comparison takes the same time for any code length and has no early exit.
4. WHEN the submitted code matches the Access_Code and the Lockout_Counter holds fewer than 5 wrong attempts, THE Pro_API SHALL respond with HTTP 200 and a `Set-Cookie` header that sets the Pro_Cookie.
5. THE Pro_Auth SHALL set the Pro_Cookie with the attributes HttpOnly, Secure, SameSite=Strict, Path=`/api/pro` and Max-Age=43200 (12 hours).
6. THE Pro_Auth SHALL sign the Pro_Cookie value as `base64url(payload).base64url(HMAC-SHA256(SESSION_SECRET, "pro:" + base64url(payload)))`, where the payload holds `role` (the string `pro`) and `exp` (expiry, epoch milliseconds, 12 hours after issue).
7. IF the submitted code does not match the Access_Code, THEN THE Pro_API SHALL respond with HTTP 401, the error `INVALID_CODE` and the message "That code isn't right.", SHALL NOT set a cookie, and THE Pro_Dashboard SHALL keep the form visible, keep focus on the access code field, and show the message with `role="alert"`.
8. IF the request body is not valid JSON, is larger than 4 KB, or fails Zod validation, THEN THE Pro_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST` (HTTP 413 and `PAYLOAD_TOO_LARGE` for a body over 4 KB), SHALL NOT set a cookie, and SHALL NOT count the request as a wrong attempt in the Lockout_Counter.
9. WHEN the login succeeds, THE Pro_Dashboard SHALL clear the access code field, replace the form with the job list described in Requirement 4, and load that list without a page reload.
10. THE Pro_API SHALL include the header `Cache-Control: no-store` on every response from `POST /api/pro/login`, including error responses.
11. WHEN the Pro_User chooses the "Log out" button, THE Pro_Dashboard SHALL send `POST /api/pro/logout`, and THE Pro_API SHALL respond with HTTP 200 and a `Set-Cookie` header that expires the Pro_Cookie (Max-Age=0) with the same Path, Secure, HttpOnly and SameSite attributes; WHEN the response arrives, THE Pro_Dashboard SHALL show the access code form again.
12. THE Pro_API SHALL respond to `POST /api/pro/logout` with HTTP 200 whether or not a Pro_Cookie is present.
13. IF `POST /api/pro/login` fails because the network request fails or the response is not valid JSON, THEN THE Pro_Dashboard SHALL keep the form visible, keep the typed code, and show the message "We couldn't reach the server. Please try again." with `role="alert"`.

---

### Requirement 2: Access Code Lockout

**User Story:** As the owner of the App, I want repeated wrong codes from one address to be blocked for a while, so that nobody can guess the access code by trying many times.

#### Acceptance Criteria

1. THE Pro_Auth SHALL count login attempts per Hashed_IP in the Lockout_Counter, a DynamoDB item with PK and SK `PROAUTH#<ipHash>`, the attributes `count` (number, integer from 0 to 5), `windowStart` (epoch milliseconds) and `ttl` (epoch seconds), using a fixed window of 15 minutes (900,000 ms) that starts at the first attempt after the previous window ended.
2. THE Pro_Auth SHALL derive the Hashed_IP from the Trusted_Client_IP returned by `getTrustedClientIp` (Requirement 18) and from no other header value. THE Pro_Auth SHALL NOT store, log or return the raw IP address.
3. WHEN a login request arrives, THE Pro_Auth SHALL reserve one attempt with a single atomic conditional `UpdateItem` on the Lockout_Counter (add 1 to `count` only if `count` is below 5 in the current window) before comparing the code. Concurrent requests SHALL NOT bring `count` above 5 in one window.
4. WHEN the submitted code matches the Access_Code, THE Pro_Auth SHALL release the reserved attempt by decrementing `count` by 1 (never below 0), so that the Lockout_Counter counts only wrong attempts.
5. IF the reservation in criterion 3 is refused because `count` is already 5 in the current window, THEN THE Pro_API SHALL respond with HTTP 429, the error `TOO_MANY_ATTEMPTS`, a `Retry-After` header holding the whole seconds until the window ends (an integer from 1 to 900), and the message "Too many attempts. Please wait a few minutes and try again.". THE Pro_API SHALL do this even when the submitted code is correct, and SHALL NOT set a cookie.
6. WHEN 5 wrong codes have been counted from one Hashed_IP within one 15-minute window, THE Pro_API SHALL respond to the 6th and every later attempt from that Hashed_IP in that window with HTTP 429 until the window ends.
7. WHEN a correct code arrives while the Lockout_Counter for that Hashed_IP holds 4 or fewer wrong attempts in the current window, THE Pro_API SHALL accept the login.
8. WHEN a login attempt arrives at or after `windowStart` + 900,000 ms, THE Pro_Auth SHALL start a new window with `windowStart` set to the current time and `count` reset to 0 before reserving the attempt.
9. THE Pro_Auth SHALL keep the Lockout_Counter of each Hashed_IP independent of the Lockout_Counter of every other Hashed_IP.
10. THE Pro_Auth SHALL set `ttl` on the Lockout_Counter to the window end, in epoch seconds, so that DynamoDB removes the item after the window. THE Pro_Auth SHALL NOT rely on `ttl` for lockout decisions, because DynamoDB removal can lag. The decision SHALL use `windowStart` and the current time.
11. THE Pro_Auth SHALL take the current time as an input parameter (epoch milliseconds) for every window and expiry calculation, so that tests can control time.
12. IF the Lockout_Counter cannot be read or updated (any DynamoDB error other than the conditional check failing because the limit is reached), THEN THE Pro_API SHALL fail closed. It SHALL respond with HTTP 500, the error `LOGIN_FAILED` and a message saying that login failed and the user can try again later. It SHALL NOT set a Pro_Cookie, and SHALL log only the error name.
13. THE Pro_Auth SHALL NOT count a login attempt toward the Homeowner's 15-inspections-per-day limit, and THE Pro_Auth SHALL NOT write to the `RATELIMIT#` items.
14. WHEN the Pro_Dashboard receives HTTP 429 from the login route, THE Pro_Dashboard SHALL display the message from the response in an element with `role="alert"`, keep the access code form visible, and keep the entered code field editable.
15. IF the release in criterion 4 fails, THEN THE Pro_API SHALL still respond with HTTP 200 and set the Pro_Cookie, and SHALL log only the error name. The login result is already decided, and a stuck attempt only makes the lockout stricter, never weaker.
16. THE Pro_API SHALL respond to the login route with the same `Cache-Control: no-store` header on the 429 and 500 responses of this requirement.

---

### Requirement 3: Pro Route Protection and Fail-Closed Configuration

**User Story:** As the owner of the App, I want every tradesperson route to check the cookie on the server and to stay closed when the App is not configured, so that nobody reaches job data by mistake.

#### Acceptance Criteria

1. WHEN a request reaches any Pro_API route except `POST /api/pro/login` and `POST /api/pro/logout`, THE Pro_Auth SHALL verify the Pro_Cookie on the server by checking, in this order: (a) the cookie is present, (b) the HMAC-SHA256 signature matches, compared in constant time, (c) the payload decodes to an object with `role` equal to the string `pro` and a numeric `exp`, and (d) `exp` is later than the current time in epoch milliseconds.
2. IF the Pro_Cookie is absent, malformed (including a value that does not decode or does not parse), signed with a different secret, tampered with, or expired, THEN THE Pro_API SHALL respond with HTTP 401, the error `UNAUTHORIZED` and a message saying that access is needed or the session has ended, SHALL NOT throw an unhandled exception, and SHALL NOT read or write any Job, return any Job data, or reveal whether a given id exists.
3. THE Pro_Auth SHALL complete the cookie check before parsing the request body, before validating the route id, and before any DynamoDB or S3 call, so that a request without a valid Pro_Cookie never receives HTTP 400, 404 or 413.
4. IF the `PRO_ACCESS_CODE` environment variable is unset or a zero-length string, THEN THE Pro_API SHALL respond to `POST /api/pro/login` with HTTP 503, the error `PRO_DISABLED` and the message "Tradesperson access isn't available right now.", and SHALL NOT set a Pro_Cookie.
5. IF the `SESSION_SECRET` environment variable is unset or a zero-length string, THEN THE Pro_API SHALL respond to `POST /api/pro/login` with HTTP 503, the error `PRO_DISABLED` and the same message as criterion 4, SHALL NOT set a Pro_Cookie, and SHALL respond to every other Pro_API route that checks the Pro_Cookie with HTTP 401 and the error `UNAUTHORIZED`.
6. WHEN the Pro_Dashboard receives HTTP 503 with the error `PRO_DISABLED` from the login route, THE Pro_Dashboard SHALL display the message "Tradesperson access isn't available right now." in place of the access code form, SHALL NOT crash, and SHALL NOT show a job list.
7. WHILE `PRO_ACCESS_CODE` or `SESSION_SECRET` is not configured (unset or a zero-length string), THE Pro_Auth SHALL NOT grant access in any case, including a submitted empty code, a submitted code equal to an empty string, and a cookie signed with an empty key.
8. IF `PRO_ACCESS_CODE` or `SESSION_SECRET` is not configured, THEN THE Pro_Auth SHALL write one warning log entry per missing variable for each request that reaches Pro_Auth, naming only the variable (for example `PRO_ACCESS_CODE`), and SHALL NOT log any value of either variable.
9. THE Pro_API SHALL return the header `Cache-Control: no-store` on every response of every Pro_API route, including error responses (400, 401, 404, 409, 413, 429, 500, 503).
10. WHEN the Pro_Dashboard receives HTTP 401 from any Pro_API route other than login, THE Pro_Dashboard SHALL discard any job data it holds, show the access code form, and show the message "Your session has ended. Please enter the access code again."
11. THE Pro_Dashboard pages `/pro` and `/pro/jobs/[id]` SHALL each include a robots directive containing `noindex` in every state (form, job list, job detail, disabled message).
12. WHEN a request reaches `POST /api/pro/login`, THE Pro_Auth SHALL check the configuration of `PRO_ACCESS_CODE` and `SESSION_SECRET` before parsing the request body and before any read or write of the Lockout_Counter, so that an unconfigured App responds with HTTP 503 `PRO_DISABLED` and writes nothing to DynamoDB.
13. THE Pro_Auth SHALL accept a Pro_Cookie only when it is sent in the `hhi_pro` cookie, and SHALL treat a request that carries a valid `hhi_session` cookie but no valid Pro_Cookie as unauthenticated (HTTP 401 `UNAUTHORIZED`).

---

### Requirement 4: Job List

**User Story:** As a Pro_User, I want to see the newest jobs with their key facts, so that I can pick which job to open.

#### Acceptance Criteria

1. WHEN a Pro_User with a valid Pro_Cookie requests `GET /api/pro/jobs`, THE Pro_API SHALL respond with HTTP 200 and up to 50 Jobs ordered newest first by `createdAt` (descending), taking only Jobs whose `GSI1SK` is later than the instant 30 days before the current server time.
2. THE Job_Store SHALL read the list with one DynamoDB `Query` on the Job_Index with the key condition `GSI1PK = "JOBS"` and `GSI1SK` later than the instant 30 days before the current time, `ScanIndexForward` set to `false` and `Limit` set to 50.
3. THE Job_Store SHALL NOT use the DynamoDB `Scan` operation for any read in this feature, because the table also holds `RATELIMIT#` and `PROAUTH#` items.
4. IF fewer than 50 Jobs exist in the Job_Index within the 30-day window, THEN THE Pro_API SHALL return all of them with HTTP 200, and SHALL return an empty list with HTTP 200 when none exist.
5. THE Pro_API SHALL return for each Job exactly these fields: `id`, `createdAt`, `urgency`, `trade`, `location` (the answer to question a, taken from the projected `answers`), and `status`; THE Pro_API SHALL NOT return any other stored field in the list, including `diySteps`, `s3Keys`, `jobBrief`, `likelyIssue`, cost range and `confidence`.
6. THE Pro_Dashboard SHALL display for each listed Job the urgency badge (the existing UrgencyBadge), the trade, the location as Plain_Text, the creation time as a `<time>` element in the browser's time zone with the zone name shown and `dateTime` holding the UTC value, and the Job_Status as the text label from Requirement 6, criterion 5.
7. WHERE a listed Job has `isEmergency` true or Job_Status `emergency`, THE Pro_API SHALL return `trade` as null for that Job, and THE Pro_Dashboard SHALL display the urgency badge, the location, the time and the status label, and SHALL NOT display a trade, a cost, or an action for that Job.
8. THE Pro_Dashboard SHALL render each listed Job as a link to `/pro/jobs/[id]`, operable with the keyboard, and the link text SHALL include the location and the status label so that it is distinguishable to a screen reader.
9. THE Pro_API SHALL return at most 50 Jobs, SHALL NOT accept a cursor or page parameter on `GET /api/pro/jobs` (ignoring any that are sent), and SHALL NOT return a pagination token.
10. WHEN a Job is older than 30 days, THE Pro_API SHALL NOT list the Job, because of the `GSI1SK` key condition, whether or not DynamoDB has yet removed the item through `ttl`.
11. WHEN a Job was created before this feature was deployed, THE Job_Store SHALL NOT list the Job, because the Job has no `GSI1PK` attribute; the App SHALL NOT backfill existing Jobs.
12. IF the list is empty, THEN THE Pro_Dashboard SHALL display the message "No jobs yet." in place of the list.
13. THE Pro_Dashboard SHALL provide a "Refresh" button that requests `GET /api/pro/jobs` again and replaces the list with the response, SHALL disable the button while the request is in progress, and SHALL NOT refresh the list automatically.
14. IF the Query fails, THEN THE Pro_API SHALL respond with HTTP 500, the error `LOAD_FAILED` and the message "We couldn't load the jobs. Please try again.", and THE Pro_Dashboard SHALL display that message with `role="alert"`, keep the previously displayed list, and keep the "Refresh" button enabled.
15. THE Pro_Dashboard SHALL treat the Job_Index as eventually consistent: a Job created or changed in the last few seconds may be missing from the list or show its previous status, and THE Pro_Dashboard SHALL read the current status from the Job detail (Requirement 5, criterion 1).
16. WHILE the list request is in progress, THE Pro_Dashboard SHALL display a loading indicator with `role="status"` and the text "Loading jobs…".
17. WHEN the Job_Store reads an item from the Job_Index for the list, THE Job_Store SHALL validate it against a Zod schema for the fields in criterion 5 and SHALL omit an item that fails validation from the list, logging only the error name.

---

### Requirement 5: Job Detail

**User Story:** As a Pro_User, I want to read everything I need about one job, so that I can decide whether to take it.

#### Acceptance Criteria

1. WHEN a Pro_User with a valid Pro_Cookie requests `GET /api/pro/jobs/[id]` for an id that is a valid UUID and a Job that has a `status` attribute, THE Pro_API SHALL respond with HTTP 200, `Cache-Control: no-store` and the Job detail, read from the table with a strongly consistent `GetItem` (`ConsistentRead` set to `true`).
2. IF the id is not a valid UUID, the Job does not exist, or the Job has no `status` attribute, THEN THE Pro_API SHALL respond with HTTP 404 and the error `NOT_FOUND`, and SHALL NOT call S3.
3. WHILE the Job_Status is not `emergency`, THE Pro_API SHALL return exactly these fields and no others: `id`, `createdAt`, `status`, `urgency`, `likelyIssue`, `trade`, `confidence`, `costRangeLow`, `costRangeHigh`, `jobBrief`, `followUpQuestions`, `answers` (with `location`, `duration`, `recentChanges`), `infoRequests` (each with `question` and `askedAt`), `replies` (each with `text` and `at`), `offeredSlots`, `bookedSlot`, `declineReason`, and `photos`. `offeredSlots`, `bookedSlot` and `declineReason` SHALL be present only when stored. `infoRequests` and `replies` SHALL be empty lists when none are stored.
4. THE Pro_API SHALL NOT return `diySteps`, `s3Keys`, `isEmergency`, `ttl`, `GSI1PK`, `GSI1SK`, `replyCount`, `statusUpdatedAt`, `bookedAt`, or any other stored field that is not listed in criterion 3 (or in criterion 10 for an Emergency_Job), for any Job.
5. THE Job_Detail page SHALL display the cost range as `CA$<low>–CA$<high>` with thousands separators and no decimals (for example CA$1,200–CA$2,400), directly next to the text "rough range, not a quote", using the existing CostRange component.
6. THE Job_Detail page SHALL display the confidence as a tilde-prefixed whole-number percentage (for example "~75%") with the label "AI confidence in this diagnosis", using the existing formatting from `intake-and-triage`.
7. THE Job_Detail page SHALL display the three answers with the labels "Where in the home", "How long" and "Anything else" as Plain_Text, and SHALL display an answer that is absent or empty after trimming as "Not answered".
8. THE Pro_API SHALL return `photos` as a list of pre-signed S3 GET URL strings, one per stored `s3Keys` entry, in the stored order, generated on the server for this request, each with an expiry of 900 seconds (15 minutes). THE Pro_API SHALL NOT store, cache or log the URLs. A Job with no stored keys SHALL return an empty list.
9. IF generating a pre-signed URL for one key fails, THEN THE Pro_API SHALL omit that photo, return the remaining photos with HTTP 200, and log only the error name.
10. WHILE the Job_Status is `emergency`, THE Pro_API SHALL return exactly these fields and no others: `id`, `createdAt`, `status`, `urgency`, `likelyIssue`, `answers` and the Pro_Emergency_Note, and SHALL NOT call S3, so that no photo URL is generated. It SHALL NOT return cost range, `jobBrief`, `trade`, `confidence`, `followUpQuestions`, `infoRequests`, `replies`, `offeredSlots`, `bookedSlot`, `declineReason` or any action.
11. WHILE the Job_Status is `emergency`, THE Job_Detail page SHALL display the Pro_Emergency_Note, the likely issue and the answers as read-only Plain_Text, and SHALL NOT display action controls, a trade, photos, a cost range or a job brief.
12. THE Job_Detail page SHALL NOT display do-it-yourself steps for any trade, and SHALL NOT render any `diySteps` content, even if it appears in a response.
13. THE Job_Detail page SHALL display the `infoRequests` and `replies` history ordered by time ascending, each entry labelled "You asked" (for `infoRequests`) or "Homeowner replied" (for `replies`), with its text rendered as Plain_Text.
14. THE Job_Detail page SHALL display, by Job_Status: for `info_requested`, the pending question as described in criterion 19; for `accepted`, the offered Time_Slots in ascending order; for `booked`, the booked Time_Slot; for `declined`, the `declineReason` when one exists. It SHALL NOT display offered Time_Slots in `booked` or `declined`.
15. IF the DynamoDB read fails, THEN THE Pro_API SHALL respond with HTTP 500, the error `LOAD_FAILED` and the message "We couldn't load this job. Please try again.", and log only the error name.
16. THE Job_Detail page SHALL display every Time_Slot in the browser's time zone with the zone's short name shown (for example "3:00 PM EST"), using a `<time>` element whose `dateTime` attribute holds the UTC value.
17. IF the stored Job fails the Zod schema validation of Requirement 12.10, THEN THE Pro_API SHALL respond with HTTP 500, the error `RESULT_INVALID` and a plain message, and SHALL NOT return any part of the stored item.
18. WHEN the Job_Detail page receives HTTP 404 from `GET /api/pro/jobs/[id]`, THE Job_Detail page SHALL display the message "We couldn't find this job." and a link to `/pro`; WHEN it receives HTTP 500, THE Job_Detail page SHALL display the error message from the response and a "Try again" button that repeats the request.
19. WHILE the Job_Status is `info_requested`, THE Job_Detail page SHALL show the status label "Waiting for the homeowner's reply", SHALL show the latest Info_Request question as Plain_Text labelled "You asked" with its time, SHALL show the accept and decline controls of Requirement 7, criterion 18, and SHALL NOT show the ask-info control.

---

### Requirement 6: Job Status Model and Transitions

**User Story:** As a Pro_User and a Homeowner, I want a job to move through clear steps that cannot be applied twice or out of order, so that both of us always see a true status.

#### Acceptance Criteria

1. THE App SHALL store the Job_Status as one of `new`, `info_requested`, `accepted`, `declined`, `booked`, `emergency`.
2. THE Transition_Function SHALL return the next Job_Status for exactly the (current Job_Status, Job_Action) pairs in the table below, and SHALL return a rejection for every other pair, including every pair whose Job_Action is not named in the table for that Job_Status.

| Current Job_Status | Job_Action | Next Job_Status | Actor |
|---|---|---|---|
| `new` | `ask_info` | `info_requested` | Pro_User |
| `new` | `accept` | `accepted` | Pro_User |
| `new` | `decline` | `declined` | Pro_User |
| `info_requested` | `reply` | `new` | Homeowner |
| `info_requested` | `accept` | `accepted` | Pro_User |
| `info_requested` | `decline` | `declined` | Pro_User |
| `accepted` | `book` | `booked` | Homeowner |
| `new`, `info_requested`, `accepted`, `declined`, `booked` | `safety_override` | `emergency` | Safety_Layer |
| `emergency` | `safety_override` | `emergency` (no change, no write) | Safety_Layer |

3. THE Transition_Function SHALL treat `declined`, `booked` and `emergency` as Terminal_Statuses, so that for each of them it rejects every Job_Action except `safety_override`, and for `emergency` it returns `emergency` for `safety_override` and never returns any other Job_Status. (`safety_override` from `declined` or `booked` is the only allowed change out of a Terminal_Status, and it leads only to `emergency`.)
4. THE Transition_Function SHALL return `emergency` only for the Job_Action `safety_override`, and THE Safety_Layer SHALL be the only caller that issues `safety_override`. This transition is the single safety exception added to the list of allowed Status_Transitions.
5. THE App SHALL display the Job_Status to the Pro_User with exactly these labels: `new` as "New", `info_requested` as "Waiting for the homeowner's reply", `accepted` as "Accepted, waiting for the homeowner to pick a time", `declined` as "Declined", `booked` as "Booked", `emergency` as "Emergency". The labels for the Homeowner are defined in Requirement 8, criterion 3.
6. THE App SHALL render the Job_Status as visible text in every place it appears, and SHALL NOT convey it by colour, icon or position alone.
7. WHEN `POST /api/inspect` creates a Job whose result is an emergency, THE Job_Store SHALL persist the Job with `status` `emergency` in the same `PutItem` that creates the Job.
8. WHEN `POST /api/inspect` creates a Job whose result is not an emergency, THE Job_Store SHALL persist the Job with `status` `new` in the same `PutItem` that creates the Job.
9. WHEN the Job_Store applies a Status_Transition other than `safety_override`, THE Job_Store SHALL use one DynamoDB `UpdateItem` whose `ConditionExpression` requires `status` to equal the current Job_Status from which the Transition_Function computed the transition, so that of two concurrent Job_Actions on the same Job_Status at most one write succeeds. For `accept` and `decline` sent for a Job in `info_requested`, the condition SHALL be `status = info_requested`; a `reply` and an `accept` (or `decline`) racing on an `info_requested` Job SHALL therefore have exactly one winner, and the loser SHALL receive HTTP 409 under criterion 10.
10. IF the `ConditionExpression` of a Status_Transition write fails, THEN THE Route Handler SHALL read the Job once with a strongly consistent `GetItem`, SHALL respond with HTTP 409, the current `status` and the error `JOB_IS_EMERGENCY` when that status is `emergency` or `ILLEGAL_TRANSITION` otherwise, SHALL NOT retry the write, and SHALL leave the Job unchanged by this request. IF that re-read also fails, THEN THE Route Handler SHALL respond with HTTP 500 and the error `ACTION_FAILED`.
11. IF the Transition_Function rejects a Job_Action for the Job_Status read from the Job_Store, THEN THE Route Handler SHALL respond with HTTP 409 and the error `ILLEGAL_TRANSITION` (or `JOB_IS_EMERGENCY` when that status is `emergency`), with a plain message and the current `status`, SHALL NOT write to the Job, and SHALL NOT send any write for this request.
12. WHEN the Job_Store changes `status` (including the safety override), THE Job_Store SHALL set `statusUpdatedAt` to the current time as an ISO 8601 UTC string in the same `UpdateItem`. WHEN the Transition_Function returns `emergency` for a Job already in `emergency`, THE Job_Store SHALL NOT write, so `statusUpdatedAt` stays unchanged.
13. WHEN the Job_Store applies `safety_override`, THE Job_Store SHALL use one `UpdateItem` whose `ConditionExpression` requires only that the Job exists and that `status` is absent or not `emergency`, and SHALL NOT require any other previous `status`, so that a concurrent Pro_User or Homeowner write cannot leave the Job in any status other than `emergency` once the override has been issued. IF the condition fails because the Job is already in `emergency`, THEN THE Job_Store SHALL treat the result as success with no change.
14. IF a Job has no `status` attribute, THEN every Pro_API route that takes a Job id and `GET /api/inspections/[id]/status` SHALL respond with HTTP 404 and the error `NOT_FOUND`, and SHALL NOT write to the Job. For `reply` and `book` the Safety_Layer evaluation defined in Requirement 9 criteria 3 to 6 still runs first. (This restates only the status-less case; the legacy Job is otherwise unchanged.)
15. THE Job_Store SHALL accept only the six values in criterion 1 as `status`, and IF a stored Job has any other `status` value, THEN THE Route Handler SHALL respond with HTTP 500 and the error `RESULT_INVALID`.
16. THE Transition_Function SHALL be a pure, total function of its two inputs: for any Job_Status and any Job_Action it returns a value (a next Job_Status or a rejection), never throws, and returns the same output for the same inputs.
17. WHILE the Job_Status is `info_requested`, THE Transition_Function SHALL reject `ask_info`, so that only one question is pending at a time; a second `ask-info` request from a Pro_User SHALL receive HTTP 409 and the error `ILLEGAL_TRANSITION` with the current `status`. `info_requested` is not a Terminal_Status.
18. WHEN `accept` or `decline` moves a Job from `info_requested`, THE Job_Store SHALL leave `infoRequests`, `replies` and `replyCount` unchanged, so that the unanswered question stays in the history.

---

### Requirement 7: Tradesperson Actions

**User Story:** As a Pro_User, I want to accept a job with time slots, decline it, or ask the homeowner a question, so that I can respond to the job in one step.

#### Acceptance Criteria

1. WHEN a Pro_User sends `POST /api/pro/jobs/[id]/accept` with `{ "slots": [...] }` for a Job in `new` or `info_requested`, THE Pro_API SHALL store the Time_Slots in `offeredSlots`, move the Job to `accepted`, and respond as defined in criterion 15.
2. THE Pro_API SHALL validate `slots` with Zod as an array of 1 to 3 strings. Each string SHALL be an ISO 8601 UTC date-time with a `Z` suffix. Each SHALL parse to a valid instant, and the instants SHALL be distinct. Each SHALL be later than the server time when the request is processed and no later than 30 days after that time.
3. THE Pro_API SHALL store the Time_Slots sorted from earliest to latest, in the canonical form produced by `Date.prototype.toISOString`, in the attribute `offeredSlots`.
4. IF a Time_Slot fails validation, THEN THE Pro_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST`. The response SHALL include a message naming the violated rule (count, format, distinct, past, or horizon). THE Pro_API SHALL leave the Job unchanged.
5. WHEN a Pro_User sends `POST /api/pro/jobs/[id]/decline` with a JSON body for a Job in `new` or `info_requested`, THE Pro_API SHALL move the Job to `declined`. IF the trimmed `reason` is non-empty, THE Pro_API SHALL also store it, trimmed, in `declineReason`.
6. THE Pro_API SHALL treat `reason` as optional. THE Pro_API SHALL trim it and SHALL NOT store `declineReason` when the trimmed value is empty or `reason` is absent. IF the trimmed `reason` is longer than 200 characters, THEN THE Pro_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST`, and SHALL leave the Job unchanged.
7. WHEN a Pro_User sends `POST /api/pro/jobs/[id]/ask-info` with `{ "question": "..." }` for a Job in `new` (and only `new`), THE Pro_API SHALL append the trimmed question and the time it was asked (ISO 8601 UTC) to `infoRequests`, and move the Job to `info_requested`.
8. IF `question` is missing, is not a string, is empty after trimming, or is longer than 300 characters after trimming, THEN THE Pro_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST`, and SHALL leave the Job unchanged.
9. IF the Job already holds 5 Replies (`replyCount` is 5), THEN THE Pro_API SHALL respond to `ask-info` with HTTP 409 and the error `REPLY_LIMIT_REACHED`, and SHALL leave the Job unchanged. This keeps the Homeowner from being asked a question they cannot answer.
10. IF a Pro_User sends `accept` or `decline` for a Job whose Job_Status is not `new` or `info_requested`, or sends `ask-info` for a Job whose Job_Status is not `new` (including `info_requested`), and the Job_Status is not `emergency`, THEN THE Pro_API SHALL respond with HTTP 409, the error `ILLEGAL_TRANSITION` and the current `status`, and SHALL leave the Job unchanged. Requirement 6 criteria 9 to 11 govern write conflicts.
11. IF a Pro_User sends an action for an Emergency_Job, THEN THE Pro_API SHALL respond with HTTP 409, the error `JOB_IS_EMERGENCY` and the Pro_Emergency_Note, and SHALL leave the Job unchanged. THE response SHALL NOT include `offeredSlots`, `bookedSlot` or any Pro_User free text.
12. IF the id is not a valid UUID, the Job does not exist, or the Job has no `status` attribute, THEN THE Pro_API SHALL respond with HTTP 404 and the error `NOT_FOUND`.
13. THE Pro_API SHALL read the body of each action route as a stream with a running byte count and a limit of 4 KB. IF the body exceeds 4096 bytes, THEN THE Pro_API SHALL respond with HTTP 413 and the error `PAYLOAD_TOO_LARGE`, and SHALL leave the Job unchanged.
14. THE Pro_API SHALL treat the free text of the tradesperson (`reason`, `question`) as Plain_Text, SHALL NOT scan the free text for Emergency_Triggers, and SHALL NOT display the free text as, or inside, the Emergency_Message.
15. WHEN an action succeeds, THE Pro_API SHALL respond with HTTP 200 and a body containing the new `status`.
16. IF a DynamoDB write fails for a reason other than a failed condition check, THEN THE Pro_API SHALL respond with HTTP 500, the error `ACTION_FAILED` and a plain message, SHALL leave the Job unchanged, and SHALL log only the error name.
17. THE Pro_API SHALL NOT call the rate limiter of `intake-and-triage`, SO THAT a Pro_User action does not count toward the Homeowner's 15 inspections per day.
18. WHILE the Job_Status is `new`, THE Job_Detail page SHALL show the three actions (accept, decline, ask-info). WHILE the Job_Status is `info_requested`, THE Job_Detail page SHALL show accept and decline only, with the pending question visible (Requirement 5, criterion 19). WHILE the Job_Status is any other value, THE Job_Detail page SHALL NOT show any action. THE Job_Detail page SHALL show each text field (reason, question) with its limit (200 and 300) and a live character count linked by `aria-describedby`. THE Job_Detail page SHALL show the slot inputs with the labels "First time you can start", "Second time" and "Third time". Only the first input SHALL be required, and the other two are optional.
19. WHEN the Pro_User submits an action from the Job_Detail page, THE Job_Detail page SHALL disable all action controls until the response arrives. THE Job_Detail page SHALL then show the new status label (`role="status"`) on success, or the error message (`role="alert"`) on failure. On failure, THE Job_Detail page SHALL keep the entered text and slots and re-enable the controls.
20. THE Pro_API SHALL validate each action body with Zod and SHALL respond with HTTP 400 and the error `INVALID_REQUEST` when the body is not valid JSON or not a JSON object. THE Pro_API SHALL ignore unknown fields.
21. THE Pro_API SHALL perform the checks of the action routes in this order: Pro_Cookie (Requirement 3), body size limit, JSON parse and Zod validation, id validation, Job load, Job_Status check, conditional write. THE Pro_API SHALL stop at the first failing check and return its response.

---

### Requirement 8: Homeowner Status View and Refresh

**User Story:** As a Homeowner, I want to see in plain words what is happening with my job, so that I know what to do next.

#### Acceptance Criteria

1. WHEN the Homeowner opens `/inspect/[id]` and the Job has a `status` attribute other than `emergency`, THE Status_Panel SHALL request `GET /api/inspections/[id]/status` once on mount and display the status text from criterion 3 below the result, in an element with `role="status"` (polite).
2. THE Homeowner_API SHALL authorise the status, reply and book routes only by the unguessable Job id and SHALL NOT require a Pro_Cookie. IF the id is not a valid UUID or no Job with that id exists, THEN THE Homeowner_API SHALL respond with HTTP 404 and the error `NOT_FOUND`.
3. THE Status_Panel SHALL display these texts: `new` as "Waiting for a tradesperson to look at your job", `info_requested` as "A tradesperson has a question for you", `accepted` as "A tradesperson can take your job. Pick a time that suits you.", `declined` as "This tradesperson can't take your job right now", `booked` as "Your booking is confirmed".
4. WHEN `GET /api/inspections/[id]/status` succeeds for a Job whose Job_Status is not `emergency`, THE Homeowner_API SHALL respond with HTTP 200 and a JSON body that holds `status` plus only these fields for the matching status: `info_requested`: `question` (the text of the latest Info_Request); `accepted`: `offeredSlots` (1 to 3 Time_Slots, sorted ascending); `declined`: `reason`, only when one exists; `booked`: `bookedSlot`. The body for `new` SHALL hold only `status`.
5. WHILE the Job_Status is `emergency`, THE `GET /api/inspections/[id]/status` route SHALL respond with HTTP 200 and a body that holds only `status` (the value `emergency`) and `message` (the Emergency_Message), and SHALL NOT return `question`, `offeredSlots`, `reason`, `bookedSlot` or any other field.
6. WHILE the Job_Status is `new`, `info_requested` or `accepted` and the browser tab is visible, THE Status_Panel SHALL request the status every 30 seconds, measured from the completion of the previous request.
7. WHILE the browser tab is hidden, THE Status_Panel SHALL send no status request. WHEN the tab becomes visible and the Job_Status is `new`, `info_requested` or `accepted`, THE Status_Panel SHALL request the status within 1 second and then resume the 30-second interval.
8. WHILE the Job_Status is `new`, `info_requested` or `accepted`, THE Status_Panel SHALL show a "Refresh" button. WHEN the Homeowner activates it, THE Status_Panel SHALL request the status at once and restart the 30-second interval. WHILE a status request is in progress, THE Status_Panel SHALL ignore further activations, so at most 1 status request is in flight.
9. WHEN a status response sets the Job_Status to `emergency`, `declined` or `booked`, THE Status_Panel SHALL stop the 30-second interval, send no further status requests, and remove the "Refresh" button.
10. WHEN the Results_Page unmounts, THE Status_Panel SHALL clear the interval and abort any status request in progress, and SHALL NOT update state after the abort.
11. IF a status request fails (network error, non-2xx response, or a body that fails Zod validation), THEN THE Status_Panel SHALL keep showing the last known status and its details, show the message "We couldn't update the status. We'll try again." with `role="alert"`, and continue the 30-second refresh. WHEN a later request succeeds, THE Status_Panel SHALL remove the message.
12. WHILE the Session_Cache or any received data (including a status response with `status` `emergency`) marks the Job as an Emergency_Job, THE Status_Panel SHALL render nothing and send no status request, and the Results_Page SHALL show the emergency view defined in Requirement 11.
13. THE Status_Panel SHALL render the Info_Request question and the decline reason as Plain_Text.
14. THE `GET /api/inspections/[id]/status` route SHALL return the header `Cache-Control: no-store`, SHALL NOT call the rate limiter of `intake-and-triage`, and SHALL NOT set the `hhi_session` cookie.
15. WHEN the Job has no `status` attribute, THE `GET /api/inspections/[id]/status` route SHALL respond with HTTP 404 and the error `NOT_FOUND`, and THE Status_Panel SHALL render nothing and SHALL NOT retry.
16. IF the status request returns HTTP 404, THEN THE Status_Panel SHALL stop the interval, render nothing, and show no error message.
17. IF reading the Job from DynamoDB fails, THEN THE `GET /api/inspections/[id]/status` route SHALL respond with HTTP 500, the error `LOAD_FAILED` and a plain message, and SHALL log only the error name.
18. WHEN the Status_Panel receives a changed status from a request, THE Status_Panel SHALL show the new status text and details in the same update, with no status text from the previous status remaining visible.
19. WHILE the Job_Status is `booked` or `declined`, THE Status_Panel SHALL show, in addition to the status text of criterion 3 and the booking confirmation (Requirement 10, criterion 8) or the decline reason (criterion 4), one line of Plain_Text with exactly the Status_Safety_Line: "If something changes, start a new inspection. If you smell gas, see sparks or hear a CO alarm, leave the home and call 911." THE Status_Panel SHALL NOT show the Status_Safety_Line in any other Job_Status, and SHALL NOT show it for an Emergency_Job, whose view shows only the emergency banner (Requirement 11, criterion 8). The Status_Safety_Line SHALL be at or below an 8th-grade reading level, checked by hand when the text is written.

---

### Requirement 9: Homeowner Reply

**User Story:** As a Homeowner, I want to answer the tradesperson's question, so that the tradesperson can decide on my job.

#### Acceptance Criteria

1. WHILE the Job_Status is `info_requested`, THE Status_Panel SHALL show the latest Info_Request question as Plain_Text and one reply box with a visible label, a limit of 500 characters, a live character count and a "Send reply" button.
2. WHEN the Homeowner sends a Reply, THE Homeowner_API SHALL receive it at `POST /api/inspections/[id]/reply` as `{ "text": "..." }`.
3. THE Homeowner_API SHALL process a reply in this order and stop at the first step that responds: (1) reject a body larger than 4 KB with HTTP 413 and the error `PAYLOAD_TOO_LARGE`; (2) parse the JSON and require `text` to be a string, otherwise respond with HTTP 400 and the error `INVALID_REQUEST`; (3) run the Safety_Layer on the full untrimmed `text`; (4) validate that the id is a UUID, otherwise respond with HTTP 404 and the error `NOT_FOUND`; (5) validate that the trimmed `text` has 1 to 500 characters, otherwise respond with HTTP 400 and the error `INVALID_REQUEST`; (6) load the Job, and respond with HTTP 404 and the error `NOT_FOUND` when it does not exist or has no `status` attribute; (7) check the Job_Status (criteria 10 and 11); (8) check the per-Job reply limit (criterion 9); (9) write conditionally, and IF the condition fails, apply Requirement 6 criterion 10.
4. THE Homeowner_API SHALL evaluate `text` with the Safety_Layer `checkEmergency` function as one context answer on its own, with the same trigger rules as criterion 6.2 of `intake-and-triage`, and SHALL run that evaluation on every reply submission, whatever the Job_Status.
5. THE Homeowner_API SHALL NOT apply the per-Job reply limit, the 500-character limit, the id lookup or the Job_Status check before the Safety_Layer evaluation, so that a reply containing an Emergency_Trigger is never blocked by a limit or a validation rule.
6. WHEN the Safety_Layer detects an Emergency_Trigger in `text`, THE Homeowner_API SHALL respond with HTTP 200 and `{ "status": "emergency", "message": <Emergency_Message> }`, whether the id is valid, whether the Job exists, and whatever the Job_Status was.
7. WHEN the Safety_Layer detects an Emergency_Trigger in `text`, THE Job_Store SHALL apply the safety override as defined in Requirement 11.
8. WHEN the Job_Status is `info_requested`, the Safety_Layer detects no Emergency_Trigger, and `replyCount` is below 5, THE Job_Store SHALL append the Reply (the trimmed text and the time as ISO 8601 UTC) to `replies`, add 1 to `replyCount`, and set `status` to `new` with `statusUpdatedAt`, in one `UpdateItem` whose condition requires `status = info_requested` and `replyCount < 5`.
9. THE App SHALL allow at most 5 Replies per Job. IF the Job_Status is `info_requested`, the Safety_Layer detects no Emergency_Trigger, and `replyCount` is 5 or more, THEN THE Homeowner_API SHALL respond with HTTP 429 and the error `REPLY_LIMIT_REACHED`, and SHALL leave the Job unchanged.
10. IF the Job_Status is not `info_requested` (for example `accepted` or `declined` because the Pro_User acted while the Homeowner was typing) and the Safety_Layer detects no Emergency_Trigger, THEN THE Homeowner_API SHALL respond with HTTP 409, the error `ILLEGAL_TRANSITION` and the current `status`, and SHALL leave the Job unchanged. This applies equally when the Job_Status was `info_requested` at read time and the conditional write of criterion 8 fails because the Job has since changed (Requirement 6, criterion 10). A reply that contains an Emergency_Trigger is processed first, as in criteria 4 to 7.
11. IF the Job is an Emergency_Job and the Safety_Layer detects no Emergency_Trigger, THEN THE Homeowner_API SHALL respond with HTTP 409, the error `JOB_IS_EMERGENCY` and `{ "status": "emergency", "message": <Emergency_Message> }`.
12. IF the Safety_Layer detects no Emergency_Trigger and the trimmed `text` is empty or longer than 500 characters (counted as JavaScript string length), THEN THE Homeowner_API SHALL respond with HTTP 400 and the error `INVALID_REQUEST`, and SHALL leave the Job unchanged.
13. WHEN a Reply is accepted, THE Homeowner_API SHALL respond with HTTP 200 and `{ "status": "new" }`, and THE Status_Panel SHALL replace the reply box with the status text for `new`.
14. THE Homeowner_API SHALL NOT call the daily rate limiter of `intake-and-triage` and SHALL NOT count a Reply toward the 15 inspections per day.
15. WHEN a reply is accepted, THE Homeowner_API response body SHALL contain only `{ "status": "new" }`, and SHALL NOT contain any question, Reply history, Time_Slot, decline reason or other Pro_User data.
16. THE Job_Store SHALL NOT allow a Reply after the Job_Status is `declined` or `booked`, and THE Status_Panel SHALL NOT show a reply box in those statuses; this keeps the booking final.
17. THE Pro_Dashboard SHALL display each Reply as Plain_Text.
18. THE Homeowner_API reply route SHALL NOT require a Pro_Cookie, SHALL return the header `Cache-Control: no-store` on every response, and SHALL NOT set the `hhi_session` cookie.
19. IF the Safety_Layer detects no Emergency_Trigger and the Job read in step 6 or the conditional write in step 9 fails for a reason other than the condition check, THEN THE Homeowner_API SHALL respond with HTTP 500, the error `ACTION_FAILED` and a plain message, SHALL log only the error name, and SHALL leave the Job unchanged.
20. WHEN the Homeowner activates "Send reply", THE Status_Panel SHALL disable the reply box and the button until the response arrives, and SHALL keep the "Send reply" button disabled while the trimmed text is empty or longer than 500 characters. IF the response is neither a success nor an emergency, THEN THE Status_Panel SHALL show an error message with `role="alert"`, re-enable the controls, and keep the typed text.
21. IF the reply response is HTTP 409 with `ILLEGAL_TRANSITION`, THEN THE Status_Panel SHALL request the status at once, SHALL show the status text and details for the current status in the same update (criterion 8.18), SHALL show the message "This job has changed. Here is the latest." with `role="status"`, and SHALL keep the typed text visible as Plain_Text in a labelled read-only block titled "Your unsent reply" (even when the reply box is no longer shown). IF the response is HTTP 409 with `JOB_IS_EMERGENCY`, THEN THE Results_Page SHALL show the emergency view of Requirement 11.

---

### Requirement 10: Homeowner Slot Pick and Booking Confirmation

**User Story:** As a Homeowner, I want to pick one of the times the tradesperson offered, so that the booking is confirmed.

#### Acceptance Criteria

1. WHILE the Job_Status is `accepted`, THE Status_Panel SHALL list the offered Time_Slots in ascending order as a radio group with a visible label, display each Time_Slot in the browser's time zone with the zone name shown, and show a "Confirm this time" button that is disabled until one Time_Slot is selected and disabled while a booking request is in progress.
2. WHEN the Homeowner selects "Confirm this time", THE Status_Panel SHALL send `POST /api/inspections/[id]/book` with the JSON body `{ "slot": "<ISO 8601 UTC string with Z suffix>" }`, and THE Homeowner_API SHALL reject a body larger than 4 KB with HTTP 413 and the error `PAYLOAD_TOO_LARGE`, and SHALL reject a body that is not valid JSON or fails Zod validation with HTTP 400 and the error `INVALID_REQUEST`, before any DynamoDB call.
3. IF the `slot` string is not exactly equal to one entry of the stored `offeredSlots` of that Job, THEN THE Homeowner_API SHALL respond with HTTP 400 and the error `SLOT_NOT_OFFERED`, and SHALL leave the Job unchanged.
4. IF the chosen Time_Slot start is not later than the current server time, THEN THE Homeowner_API SHALL respond with HTTP 409 and the error `SLOT_EXPIRED`, SHALL leave the Job in `accepted`, and THE Status_Panel SHALL show a message that the time has passed and keep the remaining offered Time_Slots visible.
5. WHEN the id is a valid UUID, the Job is in `accepted`, and the Time_Slot passes the checks in criteria 3 and 4, THE Job_Store SHALL store `bookedSlot` (the chosen Time_Slot), `bookedAt` (ISO 8601 UTC, current server time) and `status` `booked` with `statusUpdatedAt` in one `UpdateItem` whose condition requires `status = accepted`, and SHALL leave `offeredSlots` and `ttl` unchanged.
6. IF the Job_Status is not `accepted` and is not `emergency`, or the conditional write of criterion 5 fails because the Job is no longer in `accepted`, THEN THE Homeowner_API SHALL respond with HTTP 409 and the error `ILLEGAL_TRANSITION` with the current `status`, and SHALL leave the Job unchanged, so that two concurrent bookings of the same Job cannot both succeed.
7. IF the Job is an Emergency_Job, THEN THE Homeowner_API SHALL respond to `book` with HTTP 409, the error `JOB_IS_EMERGENCY` and `{ "status": "emergency", "message": <Emergency_Message> }`, SHALL NOT return any Time_Slot, and SHALL leave the Job unchanged. This applies whether the Job was already an Emergency_Job at read time or became one before the conditional write of criterion 5.
8. WHEN the booking succeeds, THE Homeowner_API SHALL respond with HTTP 200 and `{ "status": "booked", "bookedSlot": "<canonical ISO 8601 UTC string>" }`, and THE Status_Panel SHALL show the text for `booked` and a booking confirmation that displays the date and time in the browser's time zone with the zone name shown, in a `<time>` element whose `dateTime` holds the UTC value, announced with `role="status"`.
9. WHILE the Job_Status is `booked`, THE Status_Panel SHALL show the booking confirmation, SHALL show the Status_Safety_Line of Requirement 8, criterion 19 below the booking confirmation, SHALL NOT show a Time_Slot list, a reply box, a "Confirm this time" button or any edit or cancel control, and SHALL keep the standard notice "This is a likely diagnosis, not a certain one." of the Results_Page.
10. THE App SHALL NOT offer to change or cancel a booking after the Job is `booked`.
11. WHILE the Job_Status is `declined`, THE Status_Panel SHALL show the declined text and the reason when one exists, the Status_Safety_Line of Requirement 8, criterion 19, and a link "Start a new inspection".
12. THE Homeowner_API `book` route SHALL NOT call the daily rate limiter of `intake-and-triage`, SHALL NOT set the `hhi_session` cookie, and SHALL return the header `Cache-Control: no-store`.
13. IF a DynamoDB read or write fails for a reason other than the condition check, THEN THE Homeowner_API SHALL respond with HTTP 500, the error `ACTION_FAILED` and a plain message, SHALL leave the Job unchanged, and SHALL log only the error name; THE Status_Panel SHALL show the message, keep the selection and re-enable the "Confirm this time" button.
14. IF the id is not a valid UUID, the Job does not exist, or the Job has no `status` attribute, THEN THE Homeowner_API SHALL respond to `book` with HTTP 404 and the error `NOT_FOUND`, and SHALL NOT return any Time_Slot.
15. IF the `book` response is HTTP 409 with `ILLEGAL_TRANSITION`, THEN THE Status_Panel SHALL request the status at once and show the status text for the current status; IF the response is HTTP 409 with `JOB_IS_EMERGENCY` (or the Emergency_Message arrives), THEN THE Results_Page SHALL show the emergency view as defined in Requirement 11.
16. WHEN the Job reaches `accepted` from `info_requested`, THE Status_Panel SHALL show the offered Time_Slots, the "Confirm this time" button and the `accepted` text exactly as in criterion 1, and SHALL show no reply box and no pending question.

---

### Requirement 11: Emergency Override

**User Story:** As a Homeowner, I want the emergency guidance to appear and stay whenever my words describe a danger, so that nothing in the booking flow can hide it.

#### Acceptance Criteria

1. WHEN a Reply triggers the Safety_Layer for an existing Job, THE Job_Store SHALL, in one `UpdateItem`, set `status` to `emergency`, set `statusUpdatedAt` to the current ISO 8601 UTC time, set `urgency` to `emergency`, set `isEmergency` to `true`, set `costRangeLow` and `costRangeHigh` to 0, set `jobBrief` to the empty string, set `diySteps` to the empty list, remove `offeredSlots` and `bookedSlot`, and append the Reply (`text`, `at`) to `replies` with `replyCount` increased by 1.
2. WHEN the safety override applies to a Job in `declined` or `booked`, THE Job_Store SHALL change the Job to `emergency` with the same writes as criterion 1, so that the Homeowner receives the emergency guidance (the safety exception to the terminal status).
3. THE App SHALL treat `emergency` as irreversible: no Status_Transition, Job_Action or concurrent write SHALL change an Emergency_Job to another Job_Status, and no write after the override SHALL set `urgency` to a value other than `emergency`, set `isEmergency` to `false`, or restore `offeredSlots`, `bookedSlot`, a non-empty `jobBrief`, a non-empty `diySteps` or a non-zero cost range.
4. THE Job_Store SHALL apply the safety override with a condition that the Job exists and that `status` is absent or not `emergency`. IF that condition fails because the Job is already an Emergency_Job, THEN THE Job_Store SHALL make no further write, and THE Homeowner_API SHALL still respond as in criterion 6 of Requirement 9 (HTTP 200 with the Emergency_Message).
5. IF the safety override write fails for any reason other than the condition check, or the Job does not exist, THEN THE Homeowner_API SHALL still respond with HTTP 200 and `{ "status": "emergency", "message": <Emergency_Message> }`, SHALL NOT retry the write, and SHALL log only the error name.
6. WHEN the client receives an emergency response from the Homeowner_API, THE Results_Page SHALL write to the Session_Cache entry `hhi_result_{id}` an Inspection_Result with `urgency` `emergency`, `isEmergency` `true`, `costRangeLow` and `costRangeHigh` 0, `jobBrief` empty and `diySteps` empty, and SHALL show the emergency view within the same render pass, even when the stored write failed (consistent with criteria 14.6 to 14.8 of `intake-and-triage`).
7. WHILE the Session_Cache holds an Inspection_Result for the id with `urgency` `emergency`, THE Results_Page SHALL show the emergency view and SHALL NOT replace the cache entry with a fresh copy whose `urgency` is not `emergency`, even when the fresh copy has the Job_Status `new`, `info_requested`, `accepted`, `declined` or `booked`.
8. WHILE the Job is an Emergency_Job, THE Results_Page SHALL show the emergency view of criterion 6.5 of `intake-and-triage` with the exact Emergency_Message, and THE Status_Panel SHALL render nothing: no status text, no Info_Request question, no reply box, no Time_Slots, no selection control, no booking confirmation, no "Refresh" button, no standing-notice about replies, and no network request for status.
9. WHILE the Job is an Emergency_Job, THE Pro_API SHALL respond to `accept`, `decline` and `ask-info`, and THE Homeowner_API SHALL respond to `book` and to a `reply` that has no Emergency_Trigger, with HTTP 409, the error `JOB_IS_EMERGENCY` and no change to the Job (the `book` and `reply` bodies include the Emergency_Message as defined in criteria 10.7 and 9.11).
10. WHILE the Job is an Emergency_Job, THE Pro_Dashboard SHALL show the Pro_Emergency_Note and no actions, as defined in Requirement 5.
11. THE App SHALL NOT scan the Pro_User's free text (`reason`, `question`) or the Time_Slot values for Emergency_Triggers, SHALL NOT use any Pro_User text as the emergency message, and SHALL show the Emergency_Message only as the exact fixed text defined in the Glossary.
12. WHEN a Job is `booked` and the Homeowner sends a reply that contains an Emergency_Trigger, THE Homeowner_API SHALL change the Job to `emergency` as in criterion 2 and respond as in criterion 6 of Requirement 9. THE Status_Panel SHALL show no reply box in `booked`; a Homeowner who wants to report a danger after booking sees the Status_Safety_Line (Requirement 8, criterion 19) and starts a new inspection.
13. WHILE the Job is an Emergency_Job, THE Pro_API and THE Homeowner_API SHALL NOT return `offeredSlots`, `bookedSlot` or `bookedAt` in any response, including error responses.
14. WHEN the safety override changes a Job that was not an Emergency_Job, THE Pro_API SHALL return the Pro_Emergency_Note and none of `jobBrief`, photos, cost range, `trade`, `confidence`, Time_Slots or actions in every later response for that Job, as defined in criterion 5.10.
15. IF a Pro_User action and a safety override reach the same Job at the same time, THEN THE Job_Store SHALL leave the Job in `emergency` whatever the order of the two writes, and the Pro_User action SHALL respond with HTTP 409 and the error `JOB_IS_EMERGENCY` when its conditional write fails because the Job is now an Emergency_Job.
16. WHEN a Job is created by `POST /api/inspect` with an emergency result, THE Job_Store SHALL persist the Job with `offeredSlots` absent, `bookedSlot` absent, `jobBrief` empty, `diySteps` empty and cost range 0, consistent with criterion 1.

---

### Requirement 12: Data Model Changes

**User Story:** As a developer, I want every new stored attribute, index and item type listed, so that the design and the infrastructure change match.

#### Acceptance Criteria

1. THE Job_Store SHALL add the attributes in this table to Job items (PK and SK `JOB#{id}`) and SHALL leave every existing attribute unchanged:

| Attribute | Type | Item | Meaning |
|---|---|---|---|
| `status` | String | Job | One Job_Status value |
| `statusUpdatedAt` | String | Job | ISO 8601 UTC time of the last status change, as produced by `Date.prototype.toISOString` |
| `GSI1PK` | String | Job only | Constant `JOBS`; partition key of the Job_Index |
| `GSI1SK` | String | Job only | Equal to `createdAt`; sort key of the Job_Index |
| `offeredSlots` | List of String | Job | 1 to 3 distinct Time_Slots sorted ascending; absent until `accept`; removed on safety override |
| `bookedSlot` | String | Job | The chosen Time_Slot; equals one entry of `offeredSlots` at booking time; absent until `book` |
| `bookedAt` | String | Job | ISO 8601 UTC time of the booking; absent until `book` |
| `declineReason` | String | Job | 1 to 200 characters after trimming; absent when no reason is given |
| `infoRequests` | List of Map | Job | 0 to 5 entries, each `{ question: String (1 to 300 characters), askedAt: String (ISO 8601 UTC) }` |
| `replies` | List of Map | Job | 0 to 5 entries, each `{ text: String (1 to 500 characters), at: String (ISO 8601 UTC) }` |
| `replyCount` | Number | Job | Integer 0 to 5; equals the length of `replies` |

2. THE Job_Store SHALL create the Lockout_Counter as a separate item type with PK and SK `PROAUTH#<ipHash>` and the attributes `count` (Number), `windowStart` (Number, epoch milliseconds) and `ttl` (Number, epoch seconds), and SHALL NOT write `GSI1PK`, `GSI1SK` or `status` on it.
3. THE Job_Store SHALL NOT write `GSI1PK`, `GSI1SK` or `status` on `RATELIMIT#` items, so that the Job_Index holds only Job items (a sparse index).
4. WHEN the Job_Store creates a Job, THE Job_Store SHALL write `status` (`emergency` or `new` as set in criteria 6.7 and 6.8), `statusUpdatedAt` equal to `createdAt`, `GSI1PK` equal to `JOBS`, `GSI1SK` equal to `createdAt`, `replyCount` equal to 0, and `infoRequests` and `replies` as empty lists, in the same `PutItem` as the existing attributes and the existing `ttl`.
5. THE Job_Index SHALL be defined with the name `GSI1`, attribute definitions `GSI1PK` (String) and `GSI1SK` (String), key schema `GSI1PK` as HASH key and `GSI1SK` as RANGE key, and projection type INCLUDE with the non-key attributes `id`, `createdAt`, `urgency`, `isEmergency`, `trade`, `status` and `answers`. This definition is the single source for Requirement 13 criterion 7, which SHALL NOT diverge from it.
6. THE Job_Index SHALL use the same capacity mode as the table, and SHALL provision no additional capacity beyond that mode.
7. THE App SHALL use the single constant partition key value `JOBS` for the Job_Index. This concentrates list reads and Job writes on one index partition, which is accepted for the demo volume (up to 5,000 Jobs within 30 days) and SHALL be revisited before production use.
8. THE user SHALL create the Job_Index on the existing DynamoDB table in the AWS console or CLI, and confirm the index status is `ACTIVE`, before the App is deployed; THE App SHALL NOT create or modify the index or the table.
9. WHEN the Job_Index is created on an existing table, THE Job_Index SHALL NOT contain Jobs created before the change, because they have no `GSI1PK` attribute, and THE App SHALL NOT backfill them (see criterion 4.11).
10. THE Job_Store SHALL validate every Job item that it returns to a Route Handler for a response to a client with a Zod schema (checking the types, lengths and bounds in criterion 1 and the Job_Status values), and IF validation fails, THEN THE Route Handler SHALL respond with HTTP 500 and the error `RESULT_INVALID`, SHALL return no item data, and SHALL log only the error name.
11. THE Job_Store SHALL leave the `ttl` of a Job unchanged in every `UpdateItem` of this feature, so that all Job data is removed 30 days after creation, as `safety.md` requires.
12. THE shared TypeScript types for Job_Status, Time_Slot and the status views SHALL live in `src/types/`, and THE pure Transition_Function and Time_Slot validation SHALL live under `src/lib/` as named exports with no AWS calls and no `server-only` dependency.
13. WHEN the Job_Store writes `replies`, `infoRequests` or `offeredSlots`, THE Job_Store SHALL keep `replyCount` equal to the length of `replies` in the same `UpdateItem`, and SHALL NOT write a list longer than its limit in criterion 1.
14. WHEN the Job_Store reads a Job item created before this feature (no `status` attribute), THE Job_Store SHALL return it as a Job without status, so that the Route Handlers apply criterion 6.14, and SHALL NOT fail Zod validation with `RESULT_INVALID` for the missing new attributes.
15. THE transitions `info_requested` to `accepted` and `info_requested` to `declined` (Requirement 6) SHALL add no attribute, item type or index to the data model, and SHALL write only attributes already listed in criterion 1.

---

### Requirement 13: IAM Permissions

**User Story:** As the owner of the App, I want the exact permissions the new code needs, so that I can update the IAM policy before testing live.

#### Acceptance Criteria

1. THE App SHALL use only the IAM actions in the table below, each granted only on the resource listed for it. No action SHALL contain a wildcard. The only wildcard allowed in any resource is the object-key suffix `/*` in the S3 bucket ARN. THE App SHALL NOT use or require `dynamodb:Scan`, `dynamodb:DeleteItem`, `dynamodb:BatchWriteItem`, `dynamodb:BatchGetItem`, `dynamodb:TransactWriteItems`, `dynamodb:ConditionCheckItem`, `dynamodb:*`, `s3:ListBucket`, `s3:DeleteObject` or `s3:*`.
2. THE App SHALL run in region `us-east-2` and SHALL take the region from `APP_AWS_REGION`. Every DynamoDB, S3 and Bedrock resource ARN in the IAM policy SHALL name region `us-east-2`, except the S3 bucket ARN, which has no region field. THE App SHALL obtain credentials only from the IAM compute role (Amplify) or the AWS CLI profile (local), and SHALL NOT use access keys in code, in the repository or in environment variables.
3. THE App SHALL need the new action `dynamodb:Query` on the Job_Index ARN `arn:aws:dynamodb:us-east-2:<ACCOUNT_ID>:table/<TABLE_NAME>/index/GSI1` only. THE App SHALL NOT grant `dynamodb:Query` on the table ARN. THE App SHALL NOT grant `dynamodb:GetItem`, `dynamodb:PutItem` or `dynamodb:UpdateItem` on the Job_Index ARN. The Job_Index is read only by `Query`, as described in criterion 4.2.
4. THE App SHALL need no new S3 action. `s3:GetObject` on `arn:aws:s3:::<BUCKET>/*` is already granted for the pre-signed GET URLs, and the Pro_API signs photo URLs (Requirement 5.8) with the same role and the same action. `s3:PutObject` on the same resource stays unchanged for pre-signed upload URLs.
5. THE App SHALL need no new Bedrock action; this feature makes no Bedrock call.

| Action | Resource | Used by | Status |
|---|---|---|---|
| `dynamodb:PutItem` | `arn:aws:dynamodb:us-east-2:<ACCOUNT_ID>:table/<TABLE_NAME>` | Create Job (now with status and index attributes, 6.7, 6.8, 12.4); start a new rate-limit window | Existing |
| `dynamodb:GetItem` | `arn:aws:dynamodb:us-east-2:<ACCOUNT_ID>:table/<TABLE_NAME>` | Strongly consistent Job reads (Requirements 5, 8, 9, 10); read rate-limit counter | Existing |
| `dynamodb:UpdateItem` | `arn:aws:dynamodb:us-east-2:<ACCOUNT_ID>:table/<TABLE_NAME>` | Rate-limit counter (existing); NEW uses: Job status changes (6.9), Replies (9.8), bookings (10.5), safety override (6.13, 11.1), Lockout_Counter reserve, release and new window (2.3, 2.4, 2.8) | Existing action, new uses |
| `dynamodb:Query` | `arn:aws:dynamodb:us-east-2:<ACCOUNT_ID>:table/<TABLE_NAME>/index/GSI1` | Pro job list (4.2) | **NEW** |
| `s3:PutObject` | `arn:aws:s3:::<BUCKET>/*` | Pre-signed upload URLs | Existing |
| `s3:GetObject` | `arn:aws:s3:::<BUCKET>/*` | Pre-signed GET URLs (Bedrock image fetch, Pro photos and Homeowner photos) | Existing |
| `bedrock:InvokeModel` | The ARNs in `<BEDROCK_MODEL_ARNS>` (criterion 9) | Image analysis | Existing, unchanged |

6. THE App SHALL list these placeholders in the document: `<ACCOUNT_ID>` (the AWS account id), `<TABLE_NAME>` (value of `DYNAMODB_TABLE_NAME`), `<BUCKET>` (value of `S3_BUCKET_NAME`) and `<BEDROCK_MODEL_ARNS>` (see criterion 9). The region is the fixed value `us-east-2` and SHALL NOT be a placeholder.
7. THE user SHALL create the Job_Index with these requirement-level settings: index name `GSI1`; attribute definitions `GSI1PK` (S) and `GSI1SK` (S); key schema `GSI1PK` HASH and `GSI1SK` RANGE; projection INCLUDE with `id`, `createdAt`, `urgency`, `isEmergency`, `trade`, `status`, `answers`.
8. THE App SHALL cover every DynamoDB operation described in this document with exactly these grants, and SHALL NOT add any other DynamoDB grant: `dynamodb:GetItem` on the table ARN (strongly consistent Job reads in Requirements 5, 8, 9, 10 and the existing rate-limit counter read); `dynamodb:PutItem` on the table ARN (create a Job with `status` and index attributes, Requirements 6.7, 6.8, 12.4, and start a new rate-limit window; the Lockout_Counter does not need PutItem because it is created and reset with UpdateItem); `dynamodb:UpdateItem` on the table ARN (every conditional Status_Transition 6.9, the Reply append 9.8, the booking 10.5, the safety override 6.13 and 11.1, the Lockout_Counter reserve/release/new-window steps 2.3, 2.4, 2.8, and the existing rate-limit counter); `dynamodb:Query` on the Job_Index ARN only (the job list, 4.2). A ConditionExpression needs no extra IAM action, and ttl removal needs no IAM action.
9. THE App SHALL grant `bedrock:InvokeModel` only on the ARNs in `<BEDROCK_MODEL_ARNS>`: the ARN of the model or inference profile named by `BEDROCK_MODEL_ID`; when the ID is a cross-region profile (starting with `us.`), the inference profile ARN `arn:aws:bedrock:us-east-2:<ACCOUNT_ID>:inference-profile/<INFERENCE_PROFILE_ID>` plus the foundation-model ARNs for the model in each region the profile routes to. THE App SHALL NOT grant `bedrock:InvokeModel` on `*`, and this feature SHALL add no Bedrock grant.
10. THE changes of Requirements 6 (new transitions), 17 (privacy notice) and 18 (trusted client IP) SHALL need no new IAM action, no new resource and no new environment variable beyond those already listed in this document.

---

### Requirement 14: Security and Privacy

**User Story:** As the owner of the App, I want the new routes to resist guessing, tampering and leaking, so that homeowner data stays private.

#### Acceptance Criteria

1. WHEN THE Pro_Auth compares the Access_Code digests or the Pro_Cookie signatures, THE Pro_Auth SHALL use `crypto.timingSafeEqual` on buffers of equal length, and SHALL return false without throwing when the inputs have different lengths.
2. THE Pro_Auth SHALL sign the Pro_Cookie with the purpose prefix `pro:` and the payload `role` value `pro`, so that a valid `hhi_session` token is rejected as a Pro_Cookie and a valid Pro_Cookie is rejected as an `hhi_session` token.
3. THE Pro_API SHALL set the Pro_Cookie and the logout response with the attributes HttpOnly, Secure, SameSite=Strict and Path `/api/pro`, and the logout response SHALL expire the cookie with Max-Age=0 and the same attributes.
4. THE App SHALL read the Access_Code only from `PRO_ACCESS_CODE` and the signing key only from `SESSION_SECRET`, and SHALL NOT include either value in source code, logs, API responses, DynamoDB items or client bundles.
5. IF a new route fails, THEN THE App SHALL log only the error name (for example `error.name`), and SHALL NOT log the submitted code, the cookie, `SESSION_SECRET`, the raw IP address, the Hashed_IP, Reply text, Info_Request text, decline reason or pre-signed URLs.
6. THE App SHALL NOT write the raw IP address to DynamoDB, logs or any response, and SHALL write only the Hashed_IP.
7. WHEN a new POST route receives a request, THE App SHALL read the body as a stream with a running byte count, abort reading once the count exceeds 4,096 bytes, and respond with HTTP 413 and the error `PAYLOAD_TOO_LARGE`, as `POST /api/inspect` does. The Homeowner reply route SHALL run the size check as the only size check before the Safety_Layer; the JSON parse and the text-is-a-string check of Requirement 9.3 steps 1 and 2 also come before the Safety_Layer.
8. THE App SHALL validate the request body, query parameters and route parameters of every new route with Zod, SHALL validate each Job id as a UUID, and SHALL respond with HTTP 400 and the error `INVALID_REQUEST` when validation fails (HTTP 404 `NOT_FOUND` for an invalid id where Requirements 5, 7, 8 or 6.14 define it).
9. THE App SHALL render all free text from the Pro_User and the Homeowner as Plain_Text and SHALL NOT use `dangerouslySetInnerHTML`. The length limits are reason 200, question 300 and reply 500 characters (defined in Requirements 7 and 9).
10. THE Job_Store SHALL use only the DynamoDB operations `Query` (on the Job_Index), `GetItem`, `PutItem` and `UpdateItem` in this feature, and SHALL NOT send `Scan`, `DeleteItem` or `BatchWriteItem`.
11. THE Pro_API SHALL NOT return any Job field outside the lists in Requirement 5, and THE Homeowner_API SHALL NOT return any Job field outside the lists in Requirements 8, 9 and 10, including `s3Keys`, `diySteps` (to the Pro_User), `GSI1PK`, `GSI1SK`, `ttl`, `replyCount` and the Hashed_IP.
12. THE Pro_API SHALL generate pre-signed photo URLs with an expiry of 900 seconds, per request, and SHALL NOT store, cache or log them. THE Pro_API SHALL send `Cache-Control: no-store` with the response that contains them (see Requirement 3.9).
13. THE App SHALL accept a Pro_Cookie that has a valid signature and an `exp` in the future from any browser until `exp` passes, because the cookie is stateless, and SHALL document in the design that the cookie cannot be revoked before the 12-hour expiry except by logout in the same browser.
14. WHILE the reply box is shown, THE Status_Panel SHALL display the exact text "Your replies are deleted after 30 days, like your photos.", and THE Job_Store SHALL keep the `ttl` of every Job and every Reply at 30 days after Job creation.
15. THE App SHALL return the same HTTP status, error code and message for an unknown Job id and for an id that is not a UUID on the Pro_API and Homeowner_API routes, so that a caller cannot tell the two cases apart or test whether a given id exists beyond the 404 response.

---

### Requirement 15: Theming and Accessibility

**User Story:** As a Homeowner or Pro_User, I want clear, readable screens in either theme, so that I can use them with a keyboard, a screen reader or my usual settings.

#### Acceptance Criteria

1. THE new components (the Status_Panel, the Pro_Dashboard pages and every component file added by this feature) SHALL style colour only with Tailwind utility classes that use the design tokens in `tailwind.config.ts` or the default Tailwind palette, and THE source of those files, checked by the single source-scan test of Requirement 16, criterion 13, SHALL contain no hex value, no `rgb()`, `rgba()`, `hsl()` or `hsla()` function, no CSS named colour (for example `red`, `white`), no arbitrary colour class (for example `bg-[#fff]`, `text-[rgb(0,0,0)]`), and no inline `style` attribute that sets a colour property (`color`, `background`, `background-color`, `border-color`, `fill`, `stroke`, `outline-color`).
2. THE new components SHALL apply `haunted:` variant classes for background, text, border and focus-ring colour on every element that sets one of those in the Normal theme, in the same way as `ResultsView`, `UrgencyBadge` and `ThemeToggle`, so that a later haunted-mode spec can theme these screens.
3. THE new components SHALL respond to the root class `theme-haunted` through the `haunted:` variant only, and SHALL NOT read, set, toggle or store the theme (no access to `document.documentElement.classList`, `localStorage` or `matchMedia` for theme purposes).
4. THE new components SHALL use Tailwind colour classes whose Normal-theme and `haunted:` pairs of text on background have a contrast ratio of at least 4.5:1 for text under 18.66px bold or 24px regular, and at least 3:1 for larger text and for interface boundaries (input borders, focus rings, radio controls). The contrast is a design rule checked by hand when the classes are chosen; no automated contrast test is required. Full WCAG validation still requires manual testing with assistive technologies and expert review.
5. THE new components SHALL be fully operable with a keyboard alone: every interactive control SHALL be reachable by Tab in DOM order that matches the visual order, SHALL show a visible focus ring (a `focus-visible:` ring class present on each control) and SHALL NOT use `tabindex` greater than 0; THE Time_Slot radio group SHALL use native `<input type="radio">` elements with one shared `name` inside a `<fieldset>` with a `<legend>`, so that the Up and Down (and Left and Right) arrow keys move the selection, and Tab moves into and out of the group as one stop.
6. THE new components SHALL give every form field (access code, slot inputs, decline reason, question, reply box) a visible `<label>` linked by `htmlFor` and `id`, and SHALL link each live character count and each field error message to its field with `aria-describedby`.
7. THE new components SHALL render each error message in an element with `role="alert"` and each status change (Job_Status text, booking confirmation, "We couldn't update the status. We'll try again.") in an element with `role="status"` (`aria-live="polite"`), except the Emergency_Message, which keeps the `role="alert"` behaviour of the EmergencyBanner.
8. THE new components SHALL show every Job_Status, urgency and error as visible text, SHALL mark every decorative icon `aria-hidden="true"`, and SHALL NOT convey any status through colour, icon or position alone.
9. THE new components SHALL write all Homeowner-facing copy so that it is at or below an 8th-grade reading level, checked by hand when the text is written (no automated readability test), and SHALL show the label "rough range, not a quote" in the same element or the element directly adjacent to every displayed cost.
10. THE Status_Panel and the Pro_Dashboard SHALL add no CSS animation, transition or `animate-*` class of their own, and SHALL NOT use scripted scrolling or motion, so that `prefers-reduced-motion` needs no special handling in these components.
11. WHILE the theme-haunted root class is present, THE new components SHALL show the same text, labels, controls and status messages as in the Normal theme, and SHALL differ only in `haunted:` styling classes.

---

### Requirement 16: Testing

**User Story:** As a developer, I want property-based tests for the safety-critical rules and integration tests for every route, so that the status model and the emergency override cannot regress.

#### Acceptance Criteria

1. THE test suite SHALL use Vitest and fast-check, and SHALL mock the AWS client modules (the DynamoDB, S3 and Bedrock clients under `lib/aws/`) with `vi.mock`, and SHALL NOT use MSW or any real AWS call, as in `intake-and-triage`.
2. THE test suite SHALL include a property test P1 that runs at least 100 fast-check runs: FOR ALL pairs of a current Job_Status (6 values) and a Job_Action (6 values), THE Transition_Function SHALL succeed exactly for the 13 pairs in the Requirement 6 table (including `info_requested` with `accept` and `decline`, which are allowed) and reject every other pair (including `info_requested` with `ask_info`, which is rejected); FOR ALL Terminal_Statuses, no Job_Action other than `safety_override` SHALL change the Job_Status; and FOR ALL sequences of 0 to 20 Job_Actions starting at `emergency`, the final Job_Status SHALL be `emergency`. THE test SHALL call the Transition_Function without any mock or I/O.
3. THE test suite SHALL include a property test P2 that runs at least 100 fast-check runs: FOR ALL sequences of 1 to 20 Pro_User and Homeowner actions (`accept`, `decline`, `ask-info`, `reply` without an Emergency_Trigger, `book`, status reads) applied to an Emergency_Job, through the Transition_Function and through the Route Handlers with an in-memory model of the conditional writes, THE Job_Status SHALL stay `emergency`, every write action SHALL return HTTP 409 (`JOB_IS_EMERGENCY`), no response SHALL contain `offeredSlots` or `bookedSlot`, and THE Status_Panel SHALL render the Emergency_Message and SHALL NOT render Time_Slots, a selection control, a booking confirmation, a reply box, status text or a "Refresh" button.
4. THE test suite SHALL include a property test P3 that runs at least 100 fast-check runs: FOR ALL replies built by inserting a trigger phrase of each of the four codes (GAS_SMELL, ELECTRICAL_FIRE, WATER_ELECTRICAL, CO_ALARM) at a random position inside arbitrary surrounding text (0 to 3,000 characters), FOR ALL previous Job_Statuses (`new`, `info_requested`, `accepted`, `declined`, `booked`, `emergency`), and FOR ALL Job states including `replyCount` 5, a Job that does not exist and an id that is not a UUID, THE Homeowner_API SHALL respond with HTTP 200 and the Emergency_Message; AND WHEN the Job exists, THE Job SHALL end in `emergency` with `offeredSlots` removed, and the mocked DynamoDB client SHALL receive no `GetItem` or `UpdateItem` call before the Safety_Layer evaluation has run (the ordering in criterion 9.3).
5. THE test suite SHALL include a property test P4 that runs at least 100 fast-check runs: FOR ALL sequences of 1 to 30 login attempts (correct or wrong) from 1 to 3 Hashed_IPs within a 15-minute window, using an injected clock (the current time passed as a parameter, never real timers or the system clock), a correct code before the 5th wrong attempt from that Hashed_IP SHALL succeed, 5 wrong attempts SHALL be followed by HTTP 429 for every later attempt from that Hashed_IP (including a correct code) until the window ends, the Lockout_Counter of one Hashed_IP SHALL NOT affect another, and WHEN the clock moves to the window end or later, THE counter SHALL reset to 0.
6. THE test suite SHALL include an integration test file for each of these routes: `POST /api/pro/login`, `POST /api/pro/logout`, `GET /api/pro/jobs`, `GET /api/pro/jobs/[id]`, `POST /api/pro/jobs/[id]/accept`, `POST /api/pro/jobs/[id]/decline`, `POST /api/pro/jobs/[id]/ask-info`, `GET /api/inspections/[id]/status`, `POST /api/inspections/[id]/reply` and `POST /api/inspections/[id]/book`. EACH file SHALL cover success (HTTP 200), validation errors (400), an id that is not a UUID or an unknown Job (404), an illegal transition (409 `ILLEGAL_TRANSITION`), an Emergency_Job (409 `JOB_IS_EMERGENCY`, or HTTP 200 with the Emergency_Message for `status` and for a triggering `reply`), a body over 4 KB (413) for each POST route except login and logout, a mocked DynamoDB failure (500 with a plain message and no secret, cookie or free text in the log output), and a Job without a `status` attribute (404). THE accept and decline files SHALL also cover success from `info_requested` (HTTP 200, `accepted` or `declined`); THE ask-info file SHALL also cover `ask-info` for a Job in `info_requested` (409 `ILLEGAL_TRANSITION`); THE reply file SHALL also cover a reply to a Job that is `accepted` or `declined` (409 `ILLEGAL_TRANSITION` with the current status, and a triggering reply still returning HTTP 200 with the Emergency_Message). THE login test SHALL also cover 401, 429 and 503. EACH Pro_API route except login and logout SHALL also be tested with an absent, malformed, tampered, wrong-secret and expired Pro_Cookie, and each of these SHALL return HTTP 401 `UNAUTHORIZED` with zero DynamoDB and S3 calls (criterion 3.3).
7. THE test suite SHALL assert that the job list sends exactly one `QueryCommand` with `IndexName` `GSI1`, key condition `GSI1PK = "JOBS"` with a `GSI1SK` lower bound 30 days before the injected current time, `ScanIndexForward` `false` and `Limit` 50, and that across the whole suite no `ScanCommand`, `DeleteItemCommand` or `BatchWriteItemCommand` is ever sent by any route in this feature (checked in a shared mock that fails the test on such a command).
8. THE test suite SHALL assert that the login route returns HTTP 429 with a `Retry-After` header after the lockout, HTTP 503 `PRO_DISABLED` when `PRO_ACCESS_CODE` is unset or empty, and HTTP 503 `PRO_DISABLED` when `SESSION_SECRET` is unset or empty, that every other Pro_API route returns 401 when `SESSION_SECRET` is unset, that no `Set-Cookie` header is present in those cases, and that a lockout counter read or update failure returns HTTP 500 `LOGIN_FAILED` without a cookie.
9. THE test suite SHALL assert that every status change other than the safety override sends an `UpdateCommand` whose `ConditionExpression` requires `status` to equal the expected previous status, that a failed condition returns HTTP 409 with the current `status` and triggers no second write, and that the safety override sends a condition that requires only that the Job exists and is not already `emergency`, and that every status change also sets `statusUpdatedAt` and leaves `ttl` unchanged.
10. THE test suite SHALL include unit tests for: Pro_Cookie signing and verification (expiry at the boundary, tampering, wrong secret, malformed value, the `pro:` purpose prefix, and rejection of a valid `hhi_session` token); the constant-time comparison (equal input, unequal input, different-length input returning false without throwing); Time_Slot validation (0, 1, 3 and 4 slots, duplicates, past, 30-day horizon boundary, invalid format, a missing `Z` suffix); and the Status_Panel 30-second refresh with fake timers (interval, hidden-tab pause, immediate refresh on visible, stop on `emergency`, `declined` and `booked`, stop and abort on unmount, and keeping the last status after a failed request).
11. THE test suite SHALL include a round-trip property test that runs at least 100 fast-check runs: FOR ALL valid Pro_Cookie payloads (`role` `pro`, any `exp`), signing then verifying with the same secret and a time before `exp` SHALL return an equivalent payload, and FOR ALL single-character changes to the signed value, verification SHALL fail.
12. THE test suite SHALL include a test that a Session_Cache entry with `urgency` `emergency` is not replaced by a fresh non-emergency copy from the Job_Store (criterion 11.7), and that an emergency response from the Homeowner_API writes the emergency entry to the Session_Cache even when the stored write failed (criterion 11.6).
13. THE test suite SHALL include one source-scan test, run over every component file added or changed by this feature, that fails when it finds a hard-coded colour (a hex value, an `rgb()`, `rgba()`, `hsl()` or `hsla()` function, a CSS named colour, an arbitrary colour class, or an inline `style` colour property), a `dangerouslySetInnerHTML`, or an interactive element (`button`, `input`, `textarea`, `a`) that lacks an accessible name (label, `aria-label` or text) or a `focus-visible:` class. This is the only source-scan test of this feature; Requirement 15, criterion 1 refers to it.
14. THE test suite SHALL leave the existing `intake-and-triage` tests passing, and THE commands `next lint`, `tsc --noEmit` and `vitest --run` SHALL all exit with code 0 before each commit.
15. THE test suite SHALL include a test that the Pro_API detail response for a non-emergency Job contains none of `diySteps` or `s3Keys`, that for an Emergency_Job it contains only the fields in criterion 5.10, that pre-signed photo URLs are generated per request, and that omitting one failed photo URL still returns the others (criterion 5.9).
16. THE test suite SHALL include a property test P5 that runs at least 100 fast-check runs: FOR ALL tradesperson free text (`reason`, `question`) and Time_Slot values, including strings that contain Emergency_Trigger phrases, THE Pro_API SHALL NOT change the Job to `emergency`, and the status route SHALL NOT return the tradesperson text as, or inside, the Emergency_Message (criterion 11.11).
17. THE test suite SHALL include a test that the reply route enforces the limit of 5 Replies (HTTP 429 `REPLY_LIMIT_REACHED`, and `ask-info` returns 409 `REPLY_LIMIT_REACHED` at 5), that `book` returns `SLOT_NOT_OFFERED` for a slot not in `offeredSlots`, and `SLOT_EXPIRED` when the injected time is at or after the slot start, and that none of the Homeowner_API routes, the Pro_API action routes or the status route calls the rate limiter or writes `RATELIMIT#` items.
18. THE test suite SHALL include a property test P6 that runs at least 100 fast-check runs: FOR ALL arbitrary client-supplied `x-forwarded-for` prefixes (0 to 5 entries, including valid IPs, empty entries, whitespace and non-IP text) placed before the same trusted (appended) entry, `getTrustedClientIp`, the Hashed_IP of the Pro_Auth and the visitor id of the rate limiter SHALL return the same value; and FOR ALL absent or malformed trusted values, the result SHALL be the constant `unknown` (Requirement 18).
19. THE test suite SHALL include an integration test for the rate limiter of `intake-and-triage` and one for `POST /api/pro/login` showing that a spoofed header cannot reset or bypass a limit: 6 login attempts with a different spoofed leading `x-forwarded-for` entry each time but the same trusted entry SHALL end with HTTP 429 on the 6th, and 16 inspection requests without a session cookie under the same conditions SHALL end with the rate-limit response on the 16th (Requirement 18). THE existing rate limiter tests that use `x-forwarded-for` SHALL be updated to the trusted-entry rule.
20. THE test suite SHALL include a concurrency test on the in-memory model of the conditional writes: a `reply` and an `accept` (and a `reply` and a `decline`) racing on one `info_requested` Job SHALL produce exactly one success, and the loser SHALL receive HTTP 409 `ILLEGAL_TRANSITION` with the current status (Requirement 6, criterion 9).

---

### Requirement 17: Privacy Notice Update

**User Story:** As a Homeowner, I want the upload page to tell me truthfully who can see my photos and answers, so that I can decide whether to send them.

#### Acceptance Criteria

1. THE Data_Retention_Notice SHALL display exactly this text: "Your photos and answers are stored privately and shared only with tradespeople using this app, so they can look at your job. Everything is deleted after 30 days."
2. THE text of criterion 1 SHALL be at or below an 8th-grade reading level, checked by hand when the text is written; no automated readability test is required.
3. THE text of criterion 1 SHALL supersede the wording of criterion 2.1 of `intake-and-triage` ("accessible only to the User"), which is no longer true once tradespeople can view jobs. THE tasks of this feature SHALL update the Data_Retention_Notice component, its existing tests (criteria 15.11 and 15.12 of `intake-and-triage`) and the text of `intake-and-triage` criterion 2.1.
4. THE Data_Retention_Notice SHALL still be shown on the upload page before the User submits, and SHALL still gate the submit button as defined in criteria 2.3 to 2.5 of `intake-and-triage`, which this feature leaves unchanged.
5. THE retention period of 30 days defined in criteria 12.1 and 12.2 of `intake-and-triage` SHALL stay unchanged.
6. THE Data_Retention_Notice and every other Homeowner-facing text of this feature SHALL NOT claim that a Job's photos or answers are visible only to the Homeowner, because the Pro_User can view the Job (Requirement 5).

---

### Requirement 18: Trusted Client IP

**User Story:** As the owner of the App, I want the client address to come only from the entry that the CDN adds, so that nobody can fake an address to reset the login lockout or the daily inspection limit.

#### Acceptance Criteria

1. THE design phase SHALL identify which header, or which entry of `x-forwarded-for`, the CDN (CloudFront) in front of Amplify Hosting adds and the server can trust. CloudFront appends the real viewer address to a client-supplied `x-forwarded-for` value, so the first entry can be faked by the client. THE design SHALL evaluate at least these candidates: the last entry, the second-to-last entry, the `cloudfront-viewer-address` header, and the availability of `x-amz-cf-id` and `CloudFront-Viewer-Address` on Amplify Hosting.
2. THE design SHALL state the verified answer and a fallback, SHALL NOT guess, and SHALL document the evidence: an AWS documentation reference and a verification procedure for the live deployment (a manual check that echoes or logs the header names and the entry count, without logging raw addresses in production, for a request sent with a spoofed `x-forwarded-for` value).
3. THE App SHALL provide one shared pure function `getTrustedClientIp(headers)` in `src/lib/` that returns the Trusted_Client_IP, and BOTH the Pro_Auth (for the Hashed_IP of Requirement 2.2) AND the rate limiter of `intake-and-triage` (its `ipVisitorId` in `src/lib/rateLimiter.ts`) SHALL use it, so that the rule lives in one place.
4. THE Hashed_IP and the rate limiter visitor id SHALL be derived from the Trusted_Client_IP only.
5. WHEN a client supplies an `x-forwarded-for` value (a single spoofed entry or extra leading entries), THE `getTrustedClientIp` function SHALL return the same value as for the same trusted entry without the client-supplied entries, so that for the same real viewer address any spoofed prefix gives the same Hashed_IP and the same visitor id.
6. IF the trusted value is absent or is not a valid IP address, THEN THE `getTrustedClientIp` function SHALL return the constant `unknown`. All such requests share one bucket, which makes the limit stricter and never weaker.
7. WHILE the App runs in local development without CloudFront, THE `getTrustedClientIp` function SHALL return `unknown` when the trusted value is absent, so that local requests share one bucket and the App still works; the design SHALL document any local override it adds.
8. THE number of trusted proxy hops SHALL be one documented constant, Trusted_Proxy_Hops, defined in the module of `getTrustedClientIp` (or one configuration value read there), and no other file SHALL hard-code a header position.
9. THE tasks of this feature SHALL change `ipVisitorId` in `src/lib/rateLimiter.ts` to use `getTrustedClientIp`, and SHALL update the `intake-and-triage` rate limiter tests that use `x-forwarded-for` (for example "uses the first x-forwarded-for entry" in `src/lib/rateLimiter.test.ts`). THIS requirement supersedes, in wording, criteria 11.3 and 11.4 of `intake-and-triage` where they refer to the IP address.
10. THE tests for this requirement are defined in Requirement 16, criteria 18 and 19.
11. BEFORE the user relies on the Pro_Auth lockout or the IP fallback of the rate limiter on the live Amplify deployment, THE user SHALL complete the manual verification procedure of criterion 2 on that deployment.

---

## Out of Scope

The following are not part of this feature:

- User accounts, sign-in, or any identity beyond the Access_Code and the Job id.
- Email or SMS notifications; the Homeowner and the Pro_User see changes only by opening or refreshing the page.
- Payments or deposits.
- Real calendars or calendar sync; a Time_Slot is a start time only.
- Maps (cut from this feature: no Leaflet, no `TradeMap`, no map element) and tradesperson location search.
- Multiple tradespeople, assignment of a Job to a named tradesperson, or a marketplace.
- Editing a booking after it is booked, and cancelling a booking.
- Pagination beyond the newest 50 jobs.
- Search and filter in the job list.
- File or photo upload by the Homeowner in a Reply.
- Backfilling Jobs created before this feature.
- Per-tradesperson cookies or cookie revocation before expiry.

## Open Questions and Decisions

### Decisions confirmed (by the user)

1. Replies after booking: no reply box in `declined` or `booked` (Requirement 9.16). A triggering reply still converts the Job to `emergency` (Requirement 11.2, 11.12). Instead of a standing emergency line, the Status_Panel shows the Status_Safety_Line in `booked` and `declined` (Requirement 8.19), and a Homeowner who needs to report a danger starts a new inspection.
2. Safety exception: `any status -> emergency` is the one added transition (Requirement 6.4).
3. No backfill: Jobs created before the Job_Index exists never appear in the Pro list and show no status panel (Requirements 4.11, 6.14, 12.14).
4. Single partition Job_Index with `GSI1PK = "JOBS"`, accepted for demo volume (Requirement 12.7).
5. Lockout counter semantics: reserve first, release on success, fail closed (Requirements 2.3, 2.4, 2.12).
6. Keyed IP hash (HMAC-SHA256 with `SESSION_SECRET`) for the Hashed_IP (Requirement 2.2).
7. Reply order: size cap, JSON parse and string check, Safety_Layer on the full untrimmed text, then id, length and status checks (Requirements 9.3, 14.7).
8. Emergency_Jobs show the Pro_User no photos, cost, brief or trade (Requirement 5.10).
9. The Pro_User never sees `diySteps` (Requirement 5.4).
10. Cookie path `/api/pro` (Requirements 1.1, 3.10).
11. A fresh copy never downgrades a cached emergency (Requirement 11.7); this adds one rule to criteria 14.7 and 14.8 of `intake-and-triage` and needs a small change to `inspectionLoader.ts` in the design.
12. Slot rules: start time only, later than now, no later than 30 days ahead (Requirements 7.2, 10.4).
13. Targets that can change in the design: 5 Replies per Job, 4 KB body cap, 30-second refresh interval, 12-hour cookie, 5 attempts per 15 minutes.
14. No Origin check on the POST routes. SameSite=Strict on the Pro_Cookie protects the Pro_API, and the Homeowner_API is authorised by the Job id alone.
15. Malformed or oversized login requests do not consume a lockout attempt (Requirement 1.8).
16. A failed release of a reserved attempt leaves the attempt counted and the login still succeeds (Requirement 2.15).
17. A 404 from the status route stops the Status_Panel with no message (Requirement 8.16).
18. Reply order as in decision 7 (Requirement 9.3).
19. First-load 401 shows the plain access code form; a later 401 shows "Your session has ended" (Requirements 1.1, 3.10).
20. Requirement 4.15 (eventually consistent list) does not conflict with the strongly consistent detail read.

### Changes made in this revision

- Requirement 6 and 7: `info_requested` accepts `accept` and `decline`; `ask_info` stays rejected while `info_requested` (one question at a time). The wording of criterion 6.11 now ends "SHALL NOT send any write for this request".
- Requirement 17 (new): the upload privacy notice text changes.
- Requirement 18 (new): one trusted client IP rule for the lockout and the rate limiter.
- Requirement 15 and 16: test-only extras removed (computed-contrast test, readability unit test, map criterion, duplicate source-scan criteria merged into 16.13).

### Still open

1. Live CloudFront header verification: the verified trusted entry or header, and the fallback, are decided in the design (Requirement 18.1, 18.2). The verification on the live Amplify deployment is a MANUAL step for the user before relying on the lockout or the IP fallback (Requirement 18.11).
2. Existing rate limiter change: `ipVisitorId` in `src/lib/rateLimiter.ts` and its tests change as part of this feature's tasks (Requirement 18.9). The wording of criteria 11.3 and 11.4 of `intake-and-triage` is superseded by Requirement 18.
3. Intake-and-triage text updates: criterion 2.1 and the tests 15.11 and 15.12 of `intake-and-triage` are updated as part of this feature's tasks (Requirement 17.3).
