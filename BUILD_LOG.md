# Haunted House Inspector - Build Log

A daily record of what I built, which Kiro features I used, and what went wrong.
This log feeds the Kiroween "How Kiro was used" write-up, the blog post and the social post.

---

## Nov 2, 2026 (Step 0, days 1 - 2)

**Done**
- Requested Kiro hackathon credits; joined the Kiro Discord (#kiroween-hackathon)
- Installed Node.js, Git, GitHub CLI and Kiro IDE
- Created the public GitHub repo with an MIT license; confirmed .kiro is not in .gitignore
- Created 4 steering docs (product, tech, structure, safety)
- Created spec 1, "Intake and triage": requirements, design and tasks

**Kiro features used**
- Vibe chat to generate the steering docs
- Spec mode for intake and triage, with safety rules written as WHEN/SHALL requirements

**Problems and fixes**
- My Kiro version had no "Generate Steering Docs" button, so I asked Kiro in chat instead
- safety.md disappeared after I clicked an undo option; I recreated it by hand
- Steering files didn't show in the panel until I turned on Auto Save and saved

---

## Nov 3, 2026 (Step 0, day 2: AWS setup and steering update)

**Done**
- Created an AWS account (Basic plan, USD $100 credit); verified phone
- Turned on MFA for the root account (authenticator app)
- Set a $20 monthly budget alert
- Using region US East (Ohio), us-east-2, for every AWS service
- Tested Amazon Bedrock in the Chat playground with a photo from my house
- Rewrote tech.md: us-east-2, no sign-in, IAM compute role (no access keys), browser frame extraction, safety and testing sections, upload limits and a per-visitor rate limit
- Had Kiro update the intake-and-triage spec to match the new tech.md

**Bedrock test**
- Model: Amazon Nova Lite
- Prompt: "You are a home repair triage assistant. From this photo, give the likely issue, which trade is needed, urgency (emergency, this week, can wait), and two follow-up questions. Reply in JSON."
- Result:
  ```json
  {
    "likely_issue": "The siding appears to be damaged or improperly installed around the window.",
    "trade_needed": "Siding or Roofing Contractor",
    "urgency": "This week",
    "follow_up_questions": [
      "Are there any signs of water damage or mold inside the affected area?",
      "Has the area around the window been exposed to extreme weather conditions recently?"
    ]
  }
  ```
- Notes: Nova Lite returned valid JSON from the first try, and the urgency and trade were sensible. The follow-up questions were useful. The app should still validate the JSON with Zod, because this was one try.

**Kiro features used**
- Steering-driven spec updates: one change to tech.md led Kiro to update requirements, design and tasks across the whole spec
- Kiro removed sign-in everywhere and added two new requirements (job persistence and a 5-per-day rate limit), new tasks, and new property tests (Property 12 for safety ordering, Property 20 for the rate limit)
- Switched the test framework to Vitest with fast-check for property-based tests

**Problems and fixes**
- Couldn't switch the console to us-east-1 (it wasn't offered on my account), so I standardized on us-east-2
- In us-east-2, Nova Lite may need the cross-region inference profile ID (starts with "us."); noted in tech.md
- Spotted a gap: the safety layer only ran after Bedrock, so an outage could hide an emergency. Asked Kiro to make safety rules run on the homeowner's answers even if Bedrock fails, with a property test for it

---

## Nov 4, 2026 (Step 1: project scaffolding)

**Done**
- Completed task 1 of the intake-and-triage spec: full project scaffolding confirmed
- `tsconfig.json` has `"strict": true` and the `@/*` path alias pointing to `src/`
- `tailwind.config.ts` has design tokens (brand, urgency, haunted palettes), custom shadows/animations, and a `haunted:` variant plugin activated by `.theme-haunted` on the root element
- `amplify.yml` build spec: `nvm install 22` + `npm ci` in preBuild, then lint â†’ type-check â†’ test â†’ build; caches `node_modules` and `.next/cache`
- `package.json` test script changed to `vitest run --passWithNoTests` so Amplify builds pass before any tests are written
- All runtime packages installed: `server-only`, `zod`, all five `@aws-sdk/*` packages
- All dev packages installed: `vitest`, `@vitest/ui`, `fast-check`, `msw`
- Full `src/` directory tree scaffolded: `app/`, `components/`, `lib/`, `types/`, `hooks/`, `test/`
- `.env.example` has all six required keys; `.env.local` is in `.gitignore`
- Amplify deployment was successful and here is the live link "https://main.d1vac6up7roci1.amplifyapp.com/" 

**Kiro features used**
- Spec mode to track task 1 status (marked completed via spec task system)
- Vibe chat to execute and verify the scaffolding steps
- Hook (`Update build log` trigger) to automate this log entry

**Problems and fixes**
- `amplify.yml` was missing `nvm install 22`; added it so Amplify picks up Node 22 LTS before `npm ci`
- Vitest was failing the Amplify build with no tests found; fixed by adding `--passWithNoTests` flag

**Next**
- Write shared TypeScript types: `UrgencyLevel`, `ContextAnswers`, `InspectionResult` (task 2.1) and `BedrockInspectionResponse` (task 2.2)
- Write Zod validation schemas for upload and inspection requests (task 3)
- Implement utility functions: `urgencyLabel`, `formatCurrency`, `formatConfidence` (task 4)
- Start the Safety Layer pure functions in `src/lib/safety/` (task 5)

---

## Nov 5, 2026 (Build week 1, day 1: spec fixes, hooks, types and schemas)

**Done**
- Fixed a spec conflict: a Bedrock timeout now returns HTTP 502 everywhere (design.md and task 12.6 said 504; the requirement said 502)
- Made every safety, property and integration test task required; only some UI unit tests stay optional
- Added two hooks: "Tests on save" (runs related Vitest tests when a file under src/ is saved) and "Pre-commit check" (type-check, lint, tests and a secret scan)
- Task 2: shared types in src/types/inspection.ts and src/types/bedrock.ts
- Task 3.1: uploadUrlRequestSchema
- Task 3.2: contextAnswersSchema, inspectRequestSchema and bedrockResponseSchema

**Kiro features used**
- Vibe chat to fix the spec: one prompt updated design.md and tasks.md together
- Agent hooks: two new command hooks (tests on save, pre-commit check)
- Spec task execution: Kiro ran tasks 3.3 and 3.4 in parallel as sub-agents, following the task dependency graph
- Steering: each sub-agent loaded the steering docs automatically

**Problems and fixes**
- Ran out of the 50 free Kiro credits partway through tasks 3.3 and 3.4; the Kiroween credits (requested Nov 1-2) haven't arrived. Deleted the half-finished test files and committed only tasks 2, 3.1 and 3.2
- While writing the Property 8 test, Kiro found that contextAnswersSchema accepts a location of only spaces (.min(1) without .trim()), which breaks Requirement 5.2. It started writing the test to match the bug; the right fix is to change the schema so the test requires rejection. To do when credits arrive
- The "Update build log" hook uses credits, so this entry was written outside Kiro

**Next**
- Set up AWS while waiting for credits: S3 bucket, DynamoDB table, IAM compute role, Amplify environment variables
- When credits arrive: fix contextAnswersSchema, then redo tasks 3.3 and 3.4
- Then task 4 (utility functions) and task 5 (Safety Layer)
- Hold the first calls as people confirm
---

## Nov 6, 2026 (Build week 1, day 2: safety layer, prompt and AWS clients)

**Done**
- Tasks 3.3 and 3.4: property tests for the Bedrock schema and the whitespace-only location (the schema now trims location)
- Task 4: urgencyLabel, formatConfidence and formatCurrency, with Properties 15 and 16
- Task 5: Safety Layer (checkEmergency and applyOverrides) with unit and property tests; widened emergency triggers, whole-word match for "gas" and "co", and DIY steps removed by trade keyword
- Task 7: Bedrock prompt template in src/lib/prompts/inspectPrompt.ts
- Task 8: S3, Bedrock and DynamoDB clients in src/lib/aws/ (pre-signed URLs, 30-day ttl, non-fatal save errors)
- Costs are now Canadian dollars only (Ontario homeowners), shown as CA$1,200 with no decimals; the multi-currency idea was added and then removed
- Bedrock timeout cut from 30 to 20 seconds so the emergency message can still be returned within the Amplify 30-second limit
- Bedrock image format is now read from the S3 Content-Type, then the file extension, so PNG and WebP uploads work
- Context question (c) now reads "Anything else we should know? For example smells, sounds, sparks or recent changes." so a gas smell is not missed
- All five @aws-sdk packages pinned to 3.1163.0 and server-only to 0.0.1; lint, type-check, 49 tests and build all pass
- Committed tasks 7 and 8 (d62627b)

**Kiro features used**
- Spec task execution: sub-agents built tasks 7 and 8; the three AWS clients ran in parallel
- Spec editing: one request updated requirements, design and tasks together for CAD, the 20-second timeout and question (c)
- Steering: tech.md and safety.md rules (no access keys, structured JSON, safety rules in code) guided the code

**Problems and fixes**
- Reviewing the first version showed bedrock.ts sent every image as JPEG; fixed by reading the real format
- A 30-second Bedrock timeout left no time for the emergency message on Amplify; fixed with 20 seconds
- An agent overwrote design.md by mistake; it was restored from git and only the requested edits were reapplied
- A type-check showed missing @aws-sdk packages while npm install was still running; it passed once the install finished
- bedrock.ts and dynamodb.ts have no direct tests yet; only the image-format helper does
- Testing the spec's emergency rules against everyday phrasing showed only 1 of 10 real emergencies was caught ("I smell gas in the kitchen" was missed); rewrote the triggers as keyword rules
- The first keyword version matched "gas" inside "gasket", so "the toilet gasket is leaking" would have shown the 911 banner; fixed with whole-word matching for "gas" and "co"

**Next**
- Task 9: rate limiter (5 inspections per day) and its property test
- Task 10: browser video frame extractor
- Tasks 11 to 13: upload-url, inspect and inspections route handlers
- Tasks 15 to 19: upload and results UI after the server checkpoint

---

## Nov 10, 2026 (Build week 1, catch-up: tasks 9 to 17)

Nov 7 to 9: no build work. The plan was shortened that morning (Kiro Crew app, map and booking cut), then restored the same day after tasks 9 to 17 were finished.

**Done**
- Task 9: rate limiter, 15 inspections per visitor per day (raised from 5 so testers and judges don't hit it), with a signed `hhi_session` cookie (HMAC-SHA256 using `SESSION_SECRET`). The visitor id is a SHA-256 hash of the IP, so raw IPs are never stored. With no secret it limits by IP only; if DynamoDB is down it allows the request, so the safety flow is never blocked. Property 20 and unit tests
- Task 10: browser frame extractor (3–5 JPEG frames, 15-second limit); clips under 1 second give one frame at 0 seconds; Properties 6 and 7
- Task 11: `GET /api/upload-url` with a file-name sanitiser and 15 integration tests (optional task 11.2 done)
- Task 12: `POST /api/inspect` pipeline. The emergency check on the homeowner's answers runs before the rate limit and before Bedrock, so an emergency is never blocked or counted, and a Bedrock failure with a trigger still returns the emergency, never a 502. Raw model output is never logged. 9 integration tests plus Property 21
- Task 13: `GET /api/inspections/[id]` with a strongly consistent read; emergency results return 200 unchanged; non-UUID ids return 404 without a database call; errors never include the result text
- Task 14 checkpoint passed
- Tasks 20.1 and 20.2 (done early): `inspectionResultSchema` accepts emergency results (costs 0, empty brief, empty DIY steps); Property 18
- Task 15: DropZone, ContextForm, UploadProgress and DataRetentionNotice, plus a pure media validator; Properties 1 to 5, 9 and 10. Not visible in the browser until task 19 builds the home page
- Task 16: `useUpload` (uploads, then analysis, with a 60-second limit) and `useInspection`; the result is copied to sessionStorage so an emergency still shows if the DynamoDB save fails; cache tests
- Task 17 checkpoint passed: type-check, lint, 244 tests and build all green
- Config: `SESSION_SECRET` added to the Amplify environment variables, the `amplify.yml` env line, `.env.example` and my local `.env.local` (not committed)
- Spec updates: "Vitest with mocked AWS clients" wording; new Requirements 6.10, 11.6 to 11.8 and 14.6 to 14.9

**Kiro features used**
- Spec task execution: sub-agents built tasks 9 to 16; independent tests ran in parallel, up to five at a time
- Spec editing: one request updated requirements, design and tasks together for each change (rate-limit order, session cache, short videos, cookie signing, the daily limit)
- Property-based testing (fast-check): Properties 1 to 7, 9, 10, 18, 20 and 21 added; they run on every push
- Steering: safety.md drove the rule that emergencies are never blocked by usage limits; tech.md was updated with `SESSION_SECRET` and the new limit so later agents follow them
- Agent hook: "Update build log" drafted this entry; I checked and corrected it before committing

**Problems and fixes**
- Design bug: the rate limiter ran before the safety check, so an emergency could get a 429; moved safety first and added a test (12.10)
- Design bug: an emergency result could vanish if the DynamoDB save failed or the read came too soon after the write; added the sessionStorage copy and a consistent read
- Spec gap: the design called the visitor cookie "signed", but no signing secret existed; added `SESSION_SECRET` with an IP-only fallback
- Spec contradiction: task 10.1 said a clip under 1 second gives one frame, but Property 7 expected floor(d) = 0 frames; fixed to max(1, floor(d)) before any code was written
- Two test files briefly failed type-check while other agents were still writing them; fixed on re-run
- Kiro kept listing "add SESSION_SECRET in the Amplify console" after it was done; Kiro sees only the repo, not AWS, so console steps are checked by hand
- Installing four test-only libraries reported 16 npm audit warnings; to check with `npm audit --omit=dev`
- Nothing has run in a real browser or against real AWS yet; only mocked tests so far

**Next**
- Wed Nov 11: Kiro's two follow-ups (the cached result id must match the URL; upload-url logs only the error name), fix the garbled characters in BUILD_LOG.md and tech.md, check the audit warnings, then tasks 18 to 21
- Thu Nov 12: first live test on Amplify with real Bedrock, S3 and DynamoDB, on laptop and phone; weekly checkpoint
- Start saving screenshots to docs/screenshots/ (none committed yet)

---

## Nov 11, 2026 (Build week 1, day 5: results, pages and the end of spec 1)

**Done**
- Task 16 follow-ups: a cached result is ignored unless its id matches the URL; `upload-url` now logs only the error name
- `POST /api/inspect` rejects bodies over 16 KB with HTTP 413 before any parsing (Content-Length check, then a byte-counted stream read)
- Task 18: results components (urgency badge, emergency banner, cost range in CAD, job brief with copy button, issue summary) and their tests, including the emergency suppression property (Property 13)
- Task 19: root layout with a Normal/Haunted theme toggle, the home page and the results page
- Photos now add up across several picks (up to 5, no duplicates, thumbnail and Remove button on each, "Add more photos" label, "Clear selection" keeps the answers); video stays one per inspection; Requirement 1.9 to 1.14, new Property 23 and `clearFiles` in `useUpload`
- An emergency result now shows only the emergency banner, the urgency badge and the issue title; trade, questions, confidence, cost, brief and DIY steps are all hidden (Requirement 6.5, Property 13)
- Tasks 20 and 21: round-trip and every-job-persisted properties (Properties 18 and 17) and the final checkpoint; 95 of 97 tasks done, only two optional tests left (7.2, 10.4)
- Deleted two unused placeholders (`/history` page and the `/api/inspections` list stub); `structure.md` now matches the app. Spec 2 will design any list route the Pro dashboard needs
- Final checks: lint, type-check and build clean; 410 tests pass in 55 files

**Kiro features used**
- Spec task execution: sub-agents built and tested tasks 15 to 21; up to five ran in parallel when files did not overlap
- Spec editing: one request updated requirements, design and tasks together for each change (additive photos, emergency-only view)
- Steering: safety.md drove the emergency-first rules; structure.md was brought back in line with the code

**Problems and fixes**
- Kiro closed unexpectedly (laptop issue); nothing was lost because every finished task was on disk, and the three tasks left open were closed after re-running all checks
- A stale `.next` folder made type-check fail on the deleted history page; clearing `.next` fixed it
- A PowerShell edit of `structure.md` garbled the box-drawing characters; I restored the file from git and redid it with a UTF-8 safe edit
- A test agent noticed that a too-large photo added while a video was selected gave the wrong message; fixed so "photos or one video, not both" wins
- Still never run in a real browser or against real AWS

**Next**
- Thu Nov 12: first live test on the Amplify deploy with real Bedrock, S3 and DynamoDB, on laptop and phone, including an emergency answer and a multi-photo pick
- Commit this work, then start spec 2 (Pro dashboard and its list route)
- Optional: tests 7.2 (prompt snapshot) and 10.4 (frame extractor); review the 16 npm audit warnings
---

## Nov 12, 2026 (Build week 1, final day: first live test on real AWS, zod upgrade)

**Done**
- First live test on the Amplify deploy (us-east-2) with real Bedrock, S3 and DynamoDB, on laptop and phone:
  - Photos: a full result with the issue, trade, urgency, "~" confidence, two follow-up questions and a CA$ range labelled "rough range, not a quote"
  - A PNG screenshot analysed correctly (the image-format fix works on real Bedrock)
  - A video from an iPhone camera roll was accepted and analysed
  - "I smell gas in the kitchen", "the outlet is sparking" and "CO detector is beeping" each showed only the emergency banner, with no cost, job brief or DIY steps
  - A result link opened in a private window loaded the same result (DynamoDB read works)
  - Uploaded files are in S3 under the job ID, and the job item is in DynamoDB
  - The `hhi_session` cookie is set after a normal inspection, which confirms `SESSION_SECRET` is on Amplify and the DynamoDB counter write works; the `RATELIMIT#` item is in the table
  - No errors in the Amplify compute logs
- The first live run needed no code fixes
- zod upgraded from 3.25.76 to 4.6.7, pinned exactly; fixes GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized collections). One code change (`z.iso.datetime()`); lint, type-check, all 410 tests and the build pass
- Week 1 complete: spec 1 is built, tested and live, one day later than the original plan

**Kiro features used**
- Vibe chat: upgraded zod across the codebase and checked that behaviour stayed the same (datetime rules, UUIDs, custom messages, the cost-range check) with the full test suite
- Spec: Kiro reopened and closed task 3.2 to record the schema change

**Problems and fixes**
- Thought the rate limiter was broken on the live site (no cookie found). The inspection I checked was an emergency, and emergencies skip the daily limit and the cookie by design (safety first). A normal inspection set the cookie. Lesson: test the limiter with a normal inspection
- zod 4 changed its built-in error wording; it only reaches users in 400 responses to malformed requests, which the web client never sends, so it was left as is
- zod 4 rejects UUID-shaped strings that aren't valid RFC UUIDs; the app only generates valid ones
- Remaining npm audit findings: postcss inside Next.js (high) and next (moderate), not exploitable here; they wait for the Next.js 16 upgrade after Dec 3

**Next**
- Fri Nov 13: write spec 2 (Pro dashboard and booking), then create spec 3 (haunted-mode), spec only
- Check which DynamoDB actions spec 2 needs (listing jobs probably needs Query or Scan) and add them to the compute role before testing live
- Keep booking calls with tradespeople and homeowners (target: 5 by Nov 18)
- Save live-test screenshots (emergency banner, a normal result) to docs/screenshots/
- Commit the Zod change (package.json, lockfile, one schema line)


---

## Nov 13, 2026 (Spec 2, day 1: spec written, AWS setup and the pure core, tasks 1 to 11)

**Done**
- Spec 2 (pro-dashboard-and-booking) written and reviewed: requirements, design and 36 tasks
- Live-test screenshots saved to docs/screenshots/
- Trusted client IP (tasks 1, 2, 7 and 30): a temporary diagnostic route measured the proxy chain on the live site from a laptop and a phone. Both gave 2 hops, so `TRUSTED_PROXY_HOPS` is 2 and `getTrustedClientIp` reads the second-to-last `x-forwarded-for` entry, with unit tests and Property 6. The diagnostic route is deleted (404 on main), and the requirements, design and tasks now say 2 hops
- AWS setup by hand (task 3): GSI1 is ACTIVE with an INCLUDE projection of seven fields; the `JobsIndexQuery` IAM statement allows Query on the index only; PRO_ACCESS_CODE and SESSION_SECRET are set in Amplify
- Task 4: shared job types, the emergency texts in one place, and one copy file with every status label and error message, tested word for word against the requirements
- Task 5: the pure status transition function (13 allowed changes) and Property 1
- Task 6: time-slot validation (1 to 3 different future times within 30 days, with an injected clock) and Property 9
- Task 8: a shared request-body reader with a byte limit; the inspect route now uses it, and all its existing tests passed unchanged
- Task 9: the access-code check (Property 8), the signed Pro cookie (Property 7) and the keyed IP hash. The cookie test changes every character of a valid cookie and confirms each one is rejected; a homeowner `hhi_session` token is rejected too
- Task 10: the login flow. After 5 wrong codes in 15 minutes, login from that network is locked; Property 4 checks this against a separate reference model with an injected clock
- Task 11 checkpoint: lint, type-check and build clean; 615 tests pass in 72 files (410 yesterday)
- Deployed to main. Live check: a normal photo inspection shows its result, and "I smell gas in the kitchen" shows only the emergency page

**Kiro features used**
- Spec-driven development: the design's correctness properties became fast-check property tests (Properties 1, 4, 6, 7, 8 and 9), each tagged with its property number
- Spec task execution: sub-agents built each module and wrote its tests in parallel, and the four checks ran after every parent task
- Spec updates: once the live measurement was in, Kiro changed the requirements, design and tasks to 2 hops and ticked off the manual tasks

**Problems and fixes**
- The new tests found a bug: a lower-case `cache-control` header could override `no-store` in the shared response helper. Fixed so `no-store` always wins
- After the change to 2 hops, two lines in tasks.md still described 1 hop, including the test example for task 32. Caught in review and fixed, so the rate limiter tests will expect the second-to-last address
- Kiro ran tasks 4 to 11 in one go, so they went in as one commit. From now on Kiro stops after each parent task, so each task gets its own commit
- Time-slot validation reports one rule at a time, so a bad time is only reported once the count is fixed. Kept as is, because the design says to report the first rule that fails

**Next**
- Sat Nov 14: tasks 12 to 16 (test helpers, schemas and views; the data layer, with jobs and the lockout on DynamoDB; server helpers; the homeowner routes; the Pro read and action routes)
- Weekly Reset site on weeklyresetwr.com and the LinkedIn Founder role, by Wed Nov 18
- Keep booking calls with tradespeople and homeowners (target: 5 by Nov 18)
---
## Nov 15, 2026 (Spec 2, day 2: test helpers, data layer, server helpers and all API routes, tasks 12 to 16)
**Done**
- Task 12 (committed Nov 13 as d8a9e64): an in-memory fake DynamoDB table for tests, job fixtures, a route-test harness, the Zod schemas for every request and response, and the views that fix exactly which fields the Pro and the homeowner see; 800 tests
- Task 13, data layer: new inspections are now stored with a status (`new`, or `emergency` when the safety check fired) and the index fields the Pro list needs. `jobs.ts` reads one job (consistent read; old jobs without a status are treated as not found) and lists the newest 50 from the last 30 days with one index Query, never a Scan. Every status change is a conditional write, so two people acting at once cannot both win. The safety override turns any job into an emergency and removes its time slots. The login lockout now lives in DynamoDB (`lockout.ts`), and Property 4 runs against it as well as the reference model, including two logins at the same moment
- `GET /api/inspections/[id]` still returns exactly the old result fields, checked with a stored job that has every new field
- Task 14, server helpers: the Pro cookie guard, the reply safety check (reuses the existing safety rules, no AI), the conflict response used after a failed conditional write, and one shared pipeline for the three Pro actions with a fixed check order (cookie first, then body size, JSON, fields, job id, job, status)
- Task 15, homeowner routes: job status, reply, and book a time slot. A reply that mentions gas, sparks, flooding near power or a CO alarm makes the job an emergency and shows the 911 message, whatever state the job is in, even if the reply is too long
- Task 16, Pro routes: job list, job detail (photo links made fresh on each request, none for an emergency), accept with 1 to 3 time slots, decline with an optional reason, and ask one question
- After each task: lint, type-check, all tests and the build clean. 1150 tests pass in 93 files (800 after task 12)
**Kiro features used**
- Spec task execution: one sub-agent per sub-task, run in order, with the four checks after each parent task and a report of files and commit message
- Spec-driven development: Property 13 (a new job carries the right status and index fields) and Property 4 extended to the real DynamoDB lockout store
- Steering: the safety rules and the no-AWS-in-components rule shaped every route; each route test checks that the rate limiter is never imported and that no secret or user text reaches the logs
**Problems and fixes**
- The first version of the Pro cookie helpers returned header strings, but the design uses cookie objects for `res.cookies.set`. Caught in review and switched to the design version; the tests check the real `Set-Cookie` header
- The lint rule for React hooks failed a test file because a test helper is called `useEnv`. Fixed by using `withEnv` in `beforeEach` and `afterEach`; later route tests follow the same pattern
- A decline sent with no body at all gets a 400 (an empty body is not valid JSON); `{}` works. Left as is for now, the dashboard will send `{}`
- One summary line in the design still describes the conflict helper with an older signature and a 429; the detailed design and the code agree. To tidy up in the spec
- The limit of 5 replies is written in three places (job store, reply route, ask-info route). Possible small cleanup: one shared constant
**Next**
- Commit tasks 13 to 16 (one commit per task), then deploy to main and check that a new inspection still works live
- Task 17: route-level property tests (emergency stays emergency, any triggering reply ends in emergency, racing actions have one winner, reply counts stay consistent) and the suite-wide guard test
- Then the UI: the Pro login and dashboard, and the status panel on the results page
- Weekly Reset site on weeklyresetwr.com and the LinkedIn Founder role, by Wed Nov 18
- Keep booking calls with tradespeople and homeowners (target: 5 by Nov 18)
---
## Nov 16, 2026 (Spec 2, day 3: route property tests, homeowner status panel, Pro dashboard, login and the trusted-IP rate limiter, tasks 17 to 34)

**Done**
- Task 17, route-level tests: property tests over the real routes and the fake table. An emergency job stays an emergency whatever anyone does (Property 2). A reply that matches a safety trigger (a gas smell or leak, sparks or burning near electrics, water near electrics, a carbon monoxide alarm) always ends in an emergency, from any state and for any job id, and the safety check runs before any database call (Property 3). The tradesperson's text never triggers an emergency (Property 5). When two actions race, exactly one wins and the other gets "This job has changed" (Property 11). Reply counts stay consistent over sequences of up to 30 actions (Property 12). A guard test confirms no new route imports the rate limiter or Bedrock. The task 18 checkpoint passed with these
- Task 19: a cached emergency on the results page can never be replaced by a normal result (Property 14), and the page switches to the emergency view the moment a reply triggers one
- Task 20: shared buttons, text fields and styles with Normal and Haunted colours and visible focus rings, plus times shown with a time zone name (for example "3:00 PM EST")
- Tasks 21 to 23: the homeowner status panel on the results page. It checks the status every 30 seconds only while the tab is visible, stops once the job is declined, booked or an emergency, shows the tradesperson's question with a reply box, lets the homeowner pick a time, and shows the booking confirmation. It never shows for an emergency
- Tasks 24 to 26: the tradesperson dashboard at /pro (access code form, job list, refresh, log out) and the job page (facts, cost labelled "rough range, not a quote", photos, history, accept with up to 3 times, decline with an optional reason, ask one question). An emergency job shows only the emergency note
- Fix (430dcc9): the "Your session has ended" sentence moved into copy.ts with a word-for-word test (Requirement 3.10)
- Task 27: the upload privacy notice now says photos and answers are shared with tradespeople using the app and deleted after 30 days; the intake spec says the same
- Task 28: one source-scan test reads every new UI file and fails on hard-coded colours, `dangerouslySetInnerHTML`, animation classes, or a control without an accessible name or a focus ring. The task 29 checkpoint passed
- Task 32: the daily limit of 15 now uses the trusted client address (the second-to-last `x-forwarded-for` entry, hops = 2), so a faked header can't reset it; tested with 16 requests carrying 16 different fake entries
- Task 33: the login and logout routes. 5 wrong codes from one network lock login for 15 minutes; faked headers can't get around the lockout; the cookie is HttpOnly, Secure, SameSite=Strict and only sent to /api/pro
- Task 34: `.env.example` comments for `PRO_ACCESS_CODE` and `SESSION_SECRET`, and a README section on the dashboard, the GSI1 index, the IAM rule and the hop count
- All committed and pushed (0cf538d, 430dcc9, cbf951a). The four checks were clean after every two tasks; 1,447 tests pass in 126 files (1,150 on Nov 15)

**Kiro features used**
- Spec task execution: up to five sub-agents in parallel on independent sub-tasks, with the four checks after every two parent tasks
- Spec-driven development: Properties 2, 3, 5, 11, 12 and 14 written as fast-check tests, and Property 6 extended to the hashed IP and the rate limiter id
- Steering: safety.md drove the emergency rules in the UI (no panel, no controls, the 911 message), and tech.md the no-AWS-in-components and Zod-everywhere rules

**Problems and fixes**
- A new test found a real bug: if a reply made the job an emergency while the results page was still reloading in the background, the reload could put the normal result back on screen. Fixed in `useInspection`, so a normal copy never replaces an emergency already showing
- The source scan found that the photo links on the Pro job page had no visible focus ring. Fixed with the same ring as the other controls
- Switching the rate limiter to the trusted entry broke 11 old tests that sent a single address (with 2 hops, that reads as "unknown"). They now build the header from `TRUSTED_PROXY_HOPS`, so they stay correct if the number ever changes
- Two sub-agents once ran builds at the same time, and one build failed on a missing `.next` file. The rerun passed; checks now run one at a time
- The empty-body decline from Nov 15 is solved in the UI: the dashboard sends `{}` when there is no reason
- Kiro ran tasks 17 to 26 in one go without stopping for commits. From task 27 on, each prompt says to do one parent task and stop
- A local run failed at the upload step. The upload code hadn't changed since Nov 11; the laptop simply has no AWS access. Rule: test anything that uses S3, Bedrock or DynamoDB on the live link, not localhost

**Next**
- Tue Nov 17: task 35 by hand on the live site (login, accept, book, decline, ask and reply, the race, an emergency reply, the lockout from a second network, CloudWatch logs, contrast, reading level, keyboard and screen reader), then task 36, the final checkpoint
- Then the Kiro features: MCP servers, a custom safety-reviewer agent, a power, and spec 3 (haunted-mode)
- Weekly Reset site on weeklyresetwr.com and the LinkedIn Founder role, by Wed Nov 18
- Keep booking calls with tradespeople and homeowners (target: 5 by Nov 18)
---
## Nov 17, 2026 (Spec 2 finish: live test and final checkpoint, tasks 35 and 36)

**Done**
- Task 35, the live check on Amplify: the IAM policy and GSI1 confirmed first, then the smoke test on the live site (login, accept, book, decline, ask and reply, the race, an emergency reply, the lockout from a second network, CloudWatch logs, TTL, the deleted diagnostic route). Every check passed except the 16-inspection rate-limit check, which was skipped on the live site
- Task 35 hand checks: contrast of every new colour pair, grade-8 reading level of the homeowner copy and the notice, and a keyboard-only and screen reader pass
- Task 36, the final checkpoint: Spec 2 (pro-dashboard-and-booking) is complete, all 36 tasks ticked, committed as 793a23a

**Kiro features used**
- Spec task list: the manual tasks were ticked in tasks.md, and the live-test result is written under task 35.2
- Spec-driven development: the skipped rate-limit check is covered by tests written from the design (`route.ratelimit.spoof.test.ts`: 16 requests with different fake `x-forwarded-for` values end in 429 on the 16th, and Bedrock is not called)

**Problems and fixes**
- The 16-inspection live check was skipped, because it would run 16 real analyses. The unit and integration tests cover it, and this is recorded in tasks.md
- `/pro` first showed "This page could not be found". The address had been added to the end of a result link; the dashboard lives at the main address plus `/pro`, and there is deliberately no button to it. The testing instructions must give the full `/pro` link

**Next**
- Nov 18: MCP servers (AWS docs and Playwright), the safety-reviewer agent, and spec 3 (haunted-mode)
- Weekly Reset site on weeklyresetwr.com and the LinkedIn Founder role
- Keep booking calls with tradespeople and homeowners (target: 5)

---
## Nov 18, 2026 (Kiro features: MCP, the safety-reviewer agent, and Haunted mode, spec 3, all 8 tasks)

**Done**
- MCP: the AWS docs and Playwright servers are set up in `.kiro/settings/mcp.json` (d679ac2)
  - The AWS docs server checked GSI1 (INCLUDE projection), the index-only `JobsIndexQuery` permission, TTL and the presigned upload against the official docs. All four match
  - The 30-day S3 lifecycle rule isn't visible from the repo, so it was checked in the S3 console: the rule is Enabled and bucket versioning is Disabled, so photos really are deleted
  - Playwright opened the live site at 390 × 844 and took the home page and Pro access code screenshots
  - The screenshots are in `docs/screenshots/`
- Safety-reviewer agent: `.kiro/agents/safety-reviewer.md` reviews code against safety.md, with read-only tools (b38adfc). Its first review and the triage are in `docs/safety-review.md`
- The review gave 18 findings: 5 High, 7 Medium and 6 Low. 11 were fixed now, 6 were not fixed (each with a written reason), and 1 moved to spec 3
- The fixes (4cb6fb5, 20 files, with new tests), covering the 11 findings:
  - an emergency now shows fixed text instead of the AI's issue text
  - the no-DIY rule also covers heating, and gas or electrical wording in the AI text
  - more trigger words (a burning smell from a dryer, water dripping from a light fixture, "carbon-monoxide"), plus text clean-up before matching, with tests that "switched off the water", "skylight" and "smoke alarm chirping" do not trigger
  - a 409 emergency reply always shows the fixed 911 message
  - the Pro emergency view shows the fixed note
  - the rate limiter logs only the error name
  - the prompt asks the AI to name danger signs plainly and treats homeowner text as information, not instructions
  - a fixed safety line appears when the analysis fails
- Not fixed, with reasons:
  - validation before the safety check (the form checks fields first)
  - waiting for the DynamoDB write (rare, and fast)
  - the save-failure fallback (the browser keeps its own copy)
  - per-field checking (deliberate, to avoid false alarms)
  - tradesperson text (trusted users)
  - emergencies skipping the rate limiter (safety.md requires it)
- Also left out on purpose: French trigger words, and "smoke" on its own as a trigger (a chirping smoke alarm would send people to 911)
- Haunted mode (spec 3): requirements, design and 8 parent tasks written (9371587), then built in four commits: task 1 (d8d0d95), tasks 2 and 3 (ee88c8d), tasks 4 and 5 (b2daf16), tasks 6 to 8 (520acad)
- Task 1, emergency rules first: the emergency banner, the emergency badge and the Pro note have one fixed style with no `haunted:` classes. An emergency page drops the Haunted class in the same render, hides the switch, and puts the theme back when the user leaves. This closes finding 13 in `docs/safety-review.md`
- Tasks 2 and 3:
  - Haunted colours defined once as tokens
  - 78 colour pairs checked against the contrast minimums
  - raw palette colours replaced on the home, results and Pro pages
  - the form-field border moved from gray-400 to gray-500 (2.54:1 failed the 3:1 minimum)
  - a real "Haunted mode" switch
- Tasks 4 and 5: ghost names shown with the real trade (for example "Poltergeist (Plumber)" and "Banshee (HVAC technician)"), haunted wording only in loading and empty states and always next to the plain line, and the Creepster font for headings, self-hosted with its OFL.txt
- Tasks 6 to 8:
  - original SVG house silhouette with a moon, cobwebs in cards, and a fog layer
  - one motion stylesheet (4 s candle flicker, 90 s fog drift, all stopped by reduced motion)
  - the old 0.15 s flicker (about 6.7 flashes a second) and the transition classes removed
  - final checkpoint: lint, type-check, 1,574 tests in 135 files and a clean build
  - no change to copy.ts, the emergency texts, `src/lib/safety/`, package.json or `sourceScan.test.ts`

**Kiro features used**
- MCP servers: AWS docs to check the AWS setup against the official documentation, and Playwright to screenshot the live site at phone size
- Custom agent: safety-reviewer, run against steering/safety.md, which produced the 18 findings
- Steering: safety.md drove the review and the emergency rules in Haunted mode
- Specs: three documents for haunted-mode, run with sub-agents, with property tests for the ghost names, the effective theme, emergency pages and contrast
- Spec updates: the requirements and design were changed after review (hide the switch on emergency pages, Creepster, the label format, the gray-500 exception, how the emergency view drops the theme)

**Problems and fixes**
- Writing the spec showed that the existing candle flicker ran at 0.15 s, about 6.7 flashes a second, over the 3-a-second limit. Replaced with a 4 s flicker
- The first design said the Haunted class could be removed "before first paint". That's impossible on a results page that learns it's an emergency only after loading, so the guarantee moved to the fixed banner, badge and note, with tests that render them under the Haunted class
- Turning cards into a shared Card changed the Normal look in places (the JobBrief border, a new card around the Pro access form) and loosened the baseline test. Caught in review and fixed with bare and haunted-only card modes; the baseline test is back to its original expectations
- Kiro ran several parent tasks in one go (2 and 3, 4 and 5, 6 to 8) despite the one-at-a-time rule, so they were committed together
- The emergency property test timed out at 5 seconds when the whole suite ran at once. It passes alone and now has a 30 second limit
- Forcing the fog to full opacity under reduced motion would make it solid, so the fog keeps its faint opacity and only stops moving. The requirements and design say so
- The task list tool failed to save some status updates during a run. Checked afterwards: all required tasks are ticked

**Next**
- Live check in both themes: phone and desktop, keyboard focus, reduced motion, an emergency in Haunted mode, and the Normal theme compared with earlier screenshots
- Feature freeze: no code changes except fixes for real bugs. The seven optional test tasks wait until after judging
- Nov 19: README rewrite, demo jobs and sample photos for judges, the Weekly Reset site and LinkedIn, and the demo video
- Nov 20: the Devpost write-up, blog and social posts, then submit
- If there's time: a Kiro power (Postman), and a safety-reviewer pass over Haunted mode
---
## Nov 21, 2026 (Pro photo viewer)

**Done**
- Pro photos open in an in-page viewer instead of a new browser tab (5191fc4): a Close button at the top, Esc to close with focus back on the photo that opened it, Previous and Next, and a message when a photo link has expired
---
## Nov 22, 2026 (Spec 4, chat-and-help: all 7 tasks)

**Done**
- The 8 design screens added to `docs/design/` for reference (60bc94a)
- AWS setup for spec 4, done by hand in the console: the SES email identity verified in us-east-2 (sandbox, one address as sender and recipient), two statements added to the Amplify compute role (`ses:SendEmail` on that identity, and `dynamodb:Query` on the main table for chat), and `CONTACT_FROM_EMAIL` and `CONTACT_TO_EMAIL` set in Amplify. No addresses or account IDs are in the repo
- Spec 4 written (requirements, design and 7 parent tasks) and built in six commits: spec and task 1 (577f5ca), task 2 (bbd908f), tasks 3 and 4 (775582b), task 5 (192dead), task 6 (9a3e436), and a last small wording change with task 6 (da6b548)
- Task 1, data and safety: chat types and schema fields, the pure rules (status rules, 100-message and 10-per-minute limits, thread order, poll schedule), `resolveVisitorId` pulled out of the rate limiter with no change to its tests, a fake DynamoDB table that supports transactions and range queries, and the chat storage module. Each message is its own item with no Job_Index attributes, and it expires with the job
- Task 2, routes: one shared send and read pipeline behind a Homeowner route and a Pro route. A homeowner message goes through the Safety Layer before any other check, and a trigger gives the fixed emergency message. Every response carries the current status and booking data
- Task 3, chat screens: the polling hook (5 s, then 30 s after 2 minutes, stopped for hidden tabs and closed jobs), the Chat_Panel components, and a contrast test for the colour pairs the chat uses
- Task 4, switch-over:
  - the "Ask a question" form, the reply box and the job history are replaced by the chat on both pages
  - the new privacy notice and the new Results page line, now kept in `copy.ts`, with exact-text tests
  - the ask-info and reply routes and their tests are untouched
  - the chat and the status now update in the same render, so "Pick a time" shows within one chat poll after the tradesperson accepts
- Task 5, help form: "Need help? Contact us" on home, results, /pro and the Pro job page, never on emergency views. `/api/help` checks safety first, drops bot submissions quietly, limits each visitor to 5 a day, saves the message with a 30-day TTL and emails it with Amazon SES. The only new package is `@aws-sdk/client-sesv2`, pinned like the other `@aws-sdk` packages
- Task 6, page order: booking is last on both pages. A failed decline now shows its error in the decline card and a failed accept in the accept card, one at a time. The help confirmation now reads "Thank you, we got your message. We'll reply to <typed email> within the next 24 hours."
- Task 7, final checkpoint: lint, type-check, 158 test files with 1,689 tests, and a clean build. The safety, source-scan, rate-limiter and ask-info and reply route tests pass, and nothing changed in `src/lib/safety/`, the emergency message or `sourceScan.test.ts`
- Live checks on Amplify passed after tasks 4, 5 and 6: chat both ways, with "Pick a time" and the booked time appearing without a refresh; "I smell gas" in the chat giving the emergency page; a real help email arriving; a trigger in the help form; the 5-a-day help limit; booking last on both pages; and phone width

**Kiro features used**
- Specs: requirements, design and tasks for chat-and-help, built with sub-agents, with the user's review and changes between each document
- Property tests: Properties 1, 2, 3, 4, 5, 7, 9 and 14 (safety, status rules, limits, storage and the help limit), each route-level one with a 30 second timeout
- Spec updates after review: one status per page, a trigger help message counting toward the daily limit, keeping the old routes until after judging, and the new notice texts
- Steering: safety.md drove the safety-first order in the chat and help routes

**Problems and fixes**
- Writing the hook tests found a real bug: a status-only change from the page restarted the poll timer, which broke the rule that it must not. Fixed in `useChatThread.ts`
- Removing the reply box broke 14 existing tests. They were pointed at the chat path instead of deleted, so the emergency coverage stays, including the Haunted-mode emergency property
- `ReplyBox.tsx` is still in the repo, because `sourceScan.test.ts` reads it by name and may not be changed. It can go once that test is allowed to change
- Old questions and replies appear in the thread sorted by stored time, so they interleave. A question only comes before a reply when the times tie. Two example tests now show this on both routes
- The Normal-theme card border (slate-300 on white, about 1.3:1) is treated as decorative, so it has no contrast row. The screens-polish spec can fix it
- `helpSection.pages.test.tsx` failed twice early (no mounted router, and a cached result leaking between scenarios). Both causes were found and are covered by the router mock and the per-test `sessionStorage` clear; five runs, shuffled runs and one full run all passed
- Tasks 3 and 4 were run together on purpose to save time, so they share one commit. The task list tool failed to save some status updates, which were re-set afterwards
- `npm install` reported 15 vulnerabilities in the existing dependency tree. Left until after submission; `npm audit fix --force` is not used

**Next**
- Spec 5, guided-intake: a 3-step home page with tap-to-choose answers, safety chips, "Try it with a sample photo" and real progress stages
- Spec 6, screens-polish
- The 11 optional test tasks (1.9, 1.10, 1.12, 2.10, 2.11, 3.6, 3.7, 3.8, 5.9, 5.10, 5.11) wait until after judging

## Spec 6 task 3: changed shapes

All additions are optional. No field is renamed, removed or retyped.

- `InspectionResult` (`src/types/inspection.ts`): `emergencyRule?: EmergencyConditionCode`, `emergencySource?: EmergencySource` (type imports only).
- `inspectionResultSchema` (`src/lib/validation/inspectionSchema.ts`): same two fields as optional Zod enums.
- `storedJobSchema` (`src/lib/validation/jobSchema.ts`): same two fields as optional Zod enums. `JobRecord` inherits them from `InspectionResult`.
- `HomeownerStatusView` emergency variant (`src/types/job.ts`) and `homeownerStatusViewSchema`: `reasonSentence?: string`.
- `ProJobDetailEmergency` (`src/types/job.ts`) and `proDetailEmergencySchema`: `reasonSentence?: string`.
- `ChatEmergencyResponse` (`src/types/chat.ts`): `reasonSentence?: string`.
- 409 `JOB_IS_EMERGENCY` body: `ApiErrorBody` (`src/types/job.ts`) and `apiErrorSchema`: `reasonSentence?: string`.
