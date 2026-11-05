# Haunted House Inspector – Build Log

A daily record of what I built, which Kiro features I used, and what went wrong.
This log feeds the Kiroween "How Kiro was used" write-up, the blog post and the social post.

---

## Nov 2, 2026 (Step 0, days 1–2)

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
- `amplify.yml` build spec: `nvm install 22` + `npm ci` in preBuild, then lint → type-check → test → build; caches `node_modules` and `.next/cache`
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
- Ran out of the 50 free Kiro credits partway through tasks 3.3 and 3.4; the Kiroween credits (requested Nov 1–2) haven't arrived. Deleted the half-finished test files and committed only tasks 2, 3.1 and 3.2
- While writing the Property 8 test, Kiro found that contextAnswersSchema accepts a location of only spaces (.min(1) without .trim()), which breaks Requirement 5.2. It started writing the test to match the bug; the right fix is to change the schema so the test requires rejection. To do when credits arrive
- The "Update build log" hook uses credits, so this entry was written outside Kiro

**Next**
- Set up AWS while waiting for credits: S3 bucket, DynamoDB table, IAM compute role, Amplify environment variables
- When credits arrive: fix contextAnswersSchema, then redo tasks 3.3 and 3.4
- Then task 4 (utility functions) and task 5 (Safety Layer)
- Hold the first calls as people confirm