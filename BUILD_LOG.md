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
