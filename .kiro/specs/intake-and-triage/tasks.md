# Implementation Plan: Intake and Triage

## Overview

Implement the end-to-end intake-and-triage flow for Haunted House Inspector: project scaffolding, shared types, Zod schemas, AWS singletons, Safety Layer, Bedrock prompt, frame extractor, Rate Limiter, Route Handlers, upload and results UI components, custom hooks, pages, and the full test suite (property-based, unit, and integration).

## Tasks

- [x] 1. Project scaffolding and configuration
  - Initialise a Next.js App Router project with TypeScript strict mode (`"strict": true` in `tsconfig.json`)
  - Configure `@/` path alias in `tsconfig.json` pointing to `src/`
  - Install and configure Tailwind CSS; add design tokens to `tailwind.config.ts`; configure Normal and Haunted theme variants (e.g. a custom `haunted:` variant) in `tailwind.config.ts`
  - Create `amplify.yml` build spec for AWS Amplify Hosting
  - Create `.env.example` with all required variable keys: `APP_AWS_REGION`, `BEDROCK_MODEL_ID`, `S3_BUCKET_NAME`, `DYNAMODB_TABLE_NAME`, `PRO_ACCESS_CODE`, `NEXT_PUBLIC_APP_URL`; add `.env.local` to `.gitignore`
  - Scaffold the directory tree: `src/app/`, `src/components/`, `src/lib/`, `src/types/`, `src/hooks/`
  - Install `server-only`, `zod`, `@aws-sdk/client-s3`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-dynamodb`, `@aws-sdk/s3-request-presigner`
  - Install dev dependencies: `vitest`, `@vitest/ui`, `fast-check`, `msw`
  - _Requirements: all (foundational)_

- [x] 2. Shared TypeScript types
  - [x] 2.1 Create `src/types/inspection.ts` — export `UrgencyLevel`, `ContextAnswers`, `InspectionResult`
    - `UrgencyLevel = 'emergency' | 'urgent' | 'soon' | 'monitor'`
    - `ContextAnswers` with `location`, `duration`, `recentChanges` string fields
    - `InspectionResult` with all fields from the design: `id`, `createdAt`, `s3Keys`, `likelyIssue`, `trade`, `urgency`, `confidence`, `costRangeLow`, `costRangeHigh`, `jobBrief`, `followUpQuestions`, `diySteps`, `isEmergency`, `answers` — no `userId` field
    - _Requirements: 8.3, 9.1, 13.1_
  - [x] 2.2 Create `src/types/bedrock.ts` — export `BedrockInspectionResponse`
    - Matches the raw Amazon Nova Lite JSON structure; `urgency` is `'urgent' | 'soon' | 'monitor'` only (no `'emergency'`)
    - _Requirements: 8.3_

- [x] 3. Zod validation schemas
  - [x] 3.1 Create `src/lib/validation/uploadSchema.ts` — export `uploadUrlRequestSchema`
    - Validates `filename` (string), `contentType` (enum of accepted MIME types), `inspectionId` (UUID string)
    - _Requirements: 4.1, 4.2_
  - [x] 3.2 Create `src/lib/validation/inspectionSchema.ts` — export `contextAnswersSchema`, `inspectRequestSchema`, `bedrockResponseSchema`
    - `contextAnswersSchema`: `location` trimmed (`.trim()`) then min 1 so whitespace-only is invalid, all fields max 500, optional defaults for `duration` and `recentChanges`
    - `bedrockResponseSchema`: all field types, ranges, and the `costRangeHigh >= costRangeLow` refinement
    - `inspectRequestSchema`: `s3Keys` array (1–5 non-empty strings), `answers: contextAnswersSchema`
    - _Requirements: 5.2, 5.5, 8.3, 8.4_
  - [x] 3.3 Write property test for `bedrockResponseSchema` (Property 19)
    - **Property 19: Zod schema correctly classifies Bedrock responses**
    - **Validates: Requirements 8.3, 8.4**
    - Use `fc.object()` (arbitrary JSON); verify `safeParse` returns `success: true` iff all constraints are met
    - Tag: `// Feature: intake-and-triage, Property 19: Zod schema correctly classifies Bedrock responses`
  - [x] 3.4 Write property test for `contextAnswersSchema` whitespace location (Property 8)
    - **Property 8: Whitespace-only location answer is invalid**
    - **Validates: Requirements 5.2**
    - Use `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` for location
    - Tag: `// Feature: intake-and-triage, Property 8: Whitespace-only location answer is invalid`

- [x] 4. Utility functions
  - [x] 4.1 Create `src/lib/utils/urgencyLabel.ts` — export `urgencyLabel(urgency: UrgencyLevel): string`
    - Maps all four values to the exact plain-English labels from the design
    - _Requirements: 9.2_
  - [x] 4.2 Create `src/lib/utils/formatCurrency.ts` — export `formatCurrency(amount: number): string`
    - Formats CAD with no decimals as `CA$1,200`: `Intl.NumberFormat('en-US', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 })` (the `en-CA` locale renders a bare `$`, and `currencyDisplay: 'narrowSymbol'` is not used; output must be exactly `CA$1,200`)
    - _Requirements: 9.4, 9.8_
  - [x] 4.3 Create `src/lib/utils/formatConfidence.ts` — export `formatConfidence(confidence: number): string`
    - Returns `~{Math.round(c * 100)}%` for any c in [0, 1]
    - _Requirements: 9.3, 9.5_
  - [x] 4.4 Write property test for `urgencyLabel` (Property 15)
    - **Property 15: Urgency label mapping is exhaustive and exact**
    - **Validates: Requirements 9.2**
    - Use `fc.constantFrom('emergency', 'urgent', 'soon', 'monitor')`; verify no value returns `undefined` or empty string and each maps to the exact specified string
    - Tag: `// Feature: intake-and-triage, Property 15: Urgency label mapping is exhaustive and exact`
  - [x] 4.5 Write property test for `formatConfidence` (Property 16)
    - **Property 16: Confidence formatting always produces a tilde-prefixed percentage**
    - **Validates: Requirements 9.3, 9.5**
    - Use `fc.float({ min: 0, max: 1 })`; verify result starts with `~`, ends with `%`, numeric portion equals `Math.round(c * 100)`
    - Tag: `// Feature: intake-and-triage, Property 16: Confidence formatting always produces a tilde-prefixed percentage`

- [x] 5. Safety Layer
  - [x] 5.1 Create `src/lib/safety/safetyLayer.ts` — export `checkEmergency` and `applyOverrides`
    - `checkEmergency(input: SafetyCheckInput): SafetyCheckResult` — `bedrockOutput` is optional; when `undefined`, evaluates context answers only. When provided, evaluates context answers AND Bedrock output. Case-insensitive substring matching for all four `EmergencyConditionCode` values, except `gas` and `co` which match whole words only (not directly preceded or followed by a letter or digit). Proximity means 200 characters or fewer between the end of one term and the start of the other, in either order.
    - The function is called **twice** in the `POST /api/inspect` pipeline: once immediately (before Bedrock, with `bedrockOutput: undefined`) and once after a successful Bedrock response (with `bedrockOutput` set). Either call returning `isEmergency: true` is sufficient to trigger the emergency override.
    - `applyOverrides(bedrockResult, safetyResult, trade): InspectionResult` — sets `urgency = 'emergency'`, zeros/clears cost and job brief, empties `diySteps` for emergency; empties `diySteps` when the trade (case-insensitive) contains `electric`, `gas`, `hvac` or `furnace`, regardless of urgency
    - Pure module: no I/O, no async, no Bedrock dependency; guard with `server-only`
    - _Requirements: 6.1–6.7, 7.1_
  - [x] 5.2 Write property test for `checkEmergency` (Property 11)
    - **Property 11: Emergency detection on any trigger-containing text**
    - **Validates: Requirements 6.1, 6.2**
    - Use `fc.string()` and inject a trigger pair at a random position, separated by a filler gap of 0–200 characters between the end of one term and the start of the other (single-phrase rules inject the phrase alone); verify `isEmergency: true`; use clean `fc.string()` without triggers for negative case
    - Tag: `// Feature: intake-and-triage, Property 11: Emergency detection on any trigger-containing text`
  - [x] 5.3 Write property test for emergency urgency override (Property 12)
    - **Property 12: Emergency urgency override is unconditional after Bedrock**
    - **Validates: Requirements 6.3, 6.7**
    - Use `fc.record(BedrockResponseArb)` with emergency context; verify `applyOverrides` always sets `urgency = 'emergency'`; also verify that `checkEmergency` returns `isEmergency: true` when called with `bedrockOutput: undefined` (context-only mode) and the context answers contain a trigger phrase
    - Tag: `// Feature: intake-and-triage, Property 12: Emergency urgency override is unconditional after Bedrock`
  - [x] 5.4 Write property test for DIY suppression by trade (Property 14)
    - **Property 14: DIY steps suppressed for dangerous trades**
    - **Validates: Requirements 7.1**
    - Build `trade` from a keyword in `fc.constantFrom('electric', 'gas', 'hvac', 'furnace')` with random casing and random prefix/suffix (e.g. `Licensed Electrician`, `Gas fitter`, `HVAC technician`) and arbitrary `diySteps`; verify result has empty `diySteps`
    - Tag: `// Feature: intake-and-triage, Property 14: DIY steps suppressed for dangerous trades`
  - [x] 5.5 Write unit tests for `checkEmergency` and `applyOverrides`
    - Test all four emergency condition codes with exact trigger phrases and case variants
    - Required test cases that MUST trigger (`isEmergency: true`):
      - `GAS_SMELL`: "I smell gas", "smells like gas", "gas leak", "rotten egg"
      - `CO_ALARM`: "CO detector is beeping", "carbon monoxide", "co alarm"
      - `ELECTRICAL_FIRE`: "the outlet is sparking", "burning plastic smell from the breaker panel"
      - `WATER_ELECTRICAL`: "basement flooded near the breaker panel", "water dripping onto the electrical outlet"
    - Required test cases that MUST NOT trigger (`isEmergency: false`): "our gas bill is high", "the dishwasher is leaking", "water stain on the ceiling", "faucet drips all night", "the toilet gasket is leaking", "the dishwasher door gasket leaks"
    - Test proximity boundary, measured as characters between the end of one term and the start of the other: 199 and 200 characters apart trigger; 201 does not (e.g. `spark` + N filler characters + `outlet`)
    - Test non-trigger inputs return `isEmergency: false`
    - Test emergency field suppression: cost range, job brief, DIY steps all cleared
    - _Requirements: 6.1–6.7, 7.1_

- [x] 6. Checkpoint — Safety Layer verified
  - Ensure all Safety Layer tests pass. Ask the user if any questions arise.

- [x] 7. Bedrock prompt template
  - [x] 7.1 Create `src/lib/prompts/inspectPrompt.ts` — export `buildInspectPrompt(ctx: InspectPromptContext): string`
    - Instructs Amazon Nova Lite to analyse images for visible home defects, use context answers, return JSON matching `BedrockInspectionResponse` exactly
    - Must instruct the model to never return `urgency: 'emergency'`
    - Must instruct the model to use non-technical language and label costs as estimates with confidence as a decimal 0–1
    - Must ask for `costRangeLow` and `costRangeHigh` in Canadian dollars (CAD)
    - _Requirements: 8.1–8.3_
  - [ ]* 7.2 Write unit snapshot test for `buildInspectPrompt`
    - Snapshot test of rendered prompt for a known `InspectPromptContext` input using Vitest
    - Verify prompt contains JSON schema instructions
    - _Requirements: 8.2, 8.3_

- [x] 8. AWS SDK singletons
  - [x] 8.1 Create `src/lib/aws/s3.ts` — export `s3Client` singleton and `getUploadPresignedUrl` / `getDownloadPresignedUrl` functions
    - Use `S3_BUCKET_NAME` and `APP_AWS_REGION` from `process.env`; guard with `server-only`
    - `getUploadPresignedUrl` uses `PutObjectCommand` with `expiresIn: 900`
    - _Requirements: 4.2, 4.4_
  - [x] 8.2 Create `src/lib/aws/bedrock.ts` — export `invokeInspectionModel(s3Keys, answers): Promise<BedrockInspectionResponse>`
    - Use `BEDROCK_MODEL_ID` from `process.env`; default model is Amazon Nova Lite using the cross-region inference profile ID (prefixed `us.`) for on-demand calls in us-east-2
    - Use `APP_AWS_REGION` from `process.env` for the `BedrockRuntimeClient` region; guard with `server-only`
    - Fetch pre-signed GET URLs for S3 keys, build `messages` payload with image content blocks (base64 bytes), call `InvokeModelCommand` with a 20-second timeout signal (Amplify stops server requests at 30 seconds, so 20 seconds leaves time to return the emergency message when Bedrock is slow)
    - Set each image block's `format` (`jpeg`, `png` or `webp`) from the S3 object's `Content-Type`, falling back to the key's file extension; do not hard-code `jpeg`
    - Returns raw parsed object; Zod validation is caller's responsibility
    - _Requirements: 8.1–8.3, 8.6, 8.7_
  - [x] 8.3 Create `src/lib/aws/dynamodb.ts` — export `persistInspection` and `getInspection` functions
    - Use `DYNAMODB_TABLE_NAME` and `APP_AWS_REGION` from `process.env`; guard with `server-only`
    - Single-table design: `PK = JOB#{id}`, `SK = JOB#{id}`; `ttl` field = createdAt + 30 days in Unix epoch
    - `getInspection` uses DynamoDB `ConsistentRead: true` because the results page reads a job immediately after it is saved
    - Every job is persisted unconditionally — no authentication check, no guest branching
    - DynamoDB write failures are non-fatal (log error, return result to client anyway)
    - _Requirements: 12.1, 14.1_

- [x] 9. Rate Limiter
  - [x] 9.1 Create `src/lib/rateLimiter.ts` — export `checkRateLimit(request: NextRequest): Promise<RateLimitResult>`
    - Cookie-first strategy: read httpOnly cookie `hhi_session` (signed token); fall back to IP address from `x-forwarded-for` header or `request.ip` if cookie is absent, invalid, or `SESSION_SECRET` is not configured
    - Cookie format: value is `base64url(payload).base64url(hmac)`, where `payload` encodes `{ visitorId, count, windowStart }` and `hmac = HMAC-SHA256(SESSION_SECRET, payload)`; verify with `crypto.timingSafeEqual` (check buffer lengths first); an invalid or tampered signature is treated as no cookie
    - `SESSION_SECRET` handling: read from `process.env`; if missing or empty, do NOT throw — ignore the cookie, do not set one, limit by IP address only, and log a single warning. Add `SESSION_SECRET` to `.env.example` (additional note; task 1 is already complete) and to the Amplify console environment variables
    - Counter storage: DynamoDB item with `PK = RATELIMIT#{visitorId}`, `SK = RATELIMIT#{visitorId}`, `ttl` = 24 hours from `windowStart`
    - Return `{ allowed: boolean, remaining: number, resetAt: number }`: if `count >= 15` → `{ allowed: false, remaining: 0, resetAt }`; otherwise increment counter and return `{ allowed: true, remaining: 15 - count, resetAt }`
    - On each allowed request, when `SESSION_SECRET` is configured, set (or refresh) the signed `hhi_session` cookie: `HttpOnly`, `SameSite=Strict`, `Secure`, `Max-Age=86400`
    - Pure server-side module; guard with `server-only`; no AWS calls except through the DynamoDB singleton
    - _Requirements: 11.1–11.7_
  - [x] 9.2 Write property test for rate limiter threshold (Property 20)
    - **Property 20: Rate limiter blocks at the threshold**
    - **Validates: Requirements 11.1, 11.2**
    - Use `fc.integer({ min: 0, max: 30 })` for visitor count; verify `checkRateLimit` returns `allowed: true` when count < 15 and `allowed: false` when count ≥ 15; verify POST /api/inspect responds with HTTP 429 before invoking the Bedrock_Client when rate-limited and the context answers contain no Emergency_Trigger (emergency requests bypass the limiter; see 12.10)
    - Tag: `// Feature: intake-and-triage, Property 20: Rate limiter blocks at the threshold`
  - [x] 9.3 Write unit tests for `checkRateLimit`
    - Test allowed when count is 0–14; blocked when count is 15 or above
    - Test cookie-first path: valid `hhi_session` cookie (valid HMAC signature) uses `visitorId` from cookie
    - Test tampered signature: a cookie with a modified payload or signature is treated as absent and falls back to IP
    - Test IP fallback: absent or invalid cookie falls back to IP
    - Test missing secret: with `SESSION_SECRET` unset or empty, the request does not fail, no cookie is read or set, limiting falls back to IP only, and a single warning is logged
    - _Requirements: 11.1, 11.3, 11.4, 11.6, 11.7_

- [x] 10. Frame extractor
  - [x] 10.1 Create `src/lib/frameExtractor.ts` — export `extractFrames(videoFile: File): Promise<FrameExtractionResult | FrameExtractionError>`
    - Use browser-native `HTMLVideoElement` and `CanvasRenderingContext2D` only; no third-party library
    - Enforce maximum duration of 30 seconds; reject with `PROCESSING_ERROR` if `duration > 30`
    - Duration ≥ 3 s: extract 3–5 evenly spaced frames; 1 s ≤ duration < 3 s: extract all whole-second frames (timestamps 1…floor(duration)); duration < 1 s: extract exactly one frame at timestamp 0
    - Scale canvas so shorter side ≥ 640 px; encode as JPEG at quality 0.82
    - Wrap entire operation in a 15-second `Promise.race` timeout; clean up `URL.createObjectURL` via `URL.revokeObjectURL`
    - _Requirements: 3.1–3.8_
  - [x] 10.2 Write property test for frame count (standard videos) (Property 6)
    - **Property 6: Frame count for standard-length videos**
    - **Validates: Requirements 3.1**
    - Use `fc.float({ min: 3, max: 30 })` for duration; mock `HTMLVideoElement`; verify 3–5 frames returned with evenly distributed timestamps
    - Tag: `// Feature: intake-and-triage, Property 6: Frame count for standard-length videos`
  - [x] 10.3 Write property test for frame count (short videos) (Property 7)
    - **Property 7: Frame count for short videos**
    - **Validates: Requirements 3.6**
    - Use `fc.float({ min: 0.001, max: 2.999, noNaN: true })` for duration; verify exactly `max(1, floor(d))` frames returned, and for `d < 1` the single frame timestamp is 0
    - Tag: `// Feature: intake-and-triage, Property 7: Frame count for short videos`
  - [ ]* 10.4 Write unit tests for `extractFrames`
    - Mock `HTMLVideoElement`; test standard duration (3–30 s), short duration (1 s ≤ d < 3 s), sub-second duration (e.g. 0.5 s → exactly one frame at 0 s), boundary at exactly 1 s, boundary at exactly 3 s, rejection when duration > 30 s
    - Test timeout after 15 s returns `TIMEOUT` error code
    - Test extraction processing error returns `PROCESSING_ERROR` code
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 11. Route Handler: `GET /api/upload-url`
  - [x] 11.1 Create `src/app/api/upload-url/route.ts` — implement `GET` handler
    - Validate query params (`filename`, `contentType`, `inspectionId`) with `uploadUrlRequestSchema`
    - Build S3 key as `{inspectionId}/{sanitised filename}`
    - Call `getUploadPresignedUrl` with `expiresIn: 900`; return `{ url, key }`
    - Return 400 on Zod validation failure; never expose AWS credentials
    - _Requirements: 4.1–4.5_
  - [x] 11.2 Write integration tests for `GET /api/upload-url` using Vitest with mocked AWS clients
    - Happy path: valid params → returns `{ url, key }`
    - Invalid `contentType` → 400
    - S3 pre-sign failure → 500
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Route Handler: `POST /api/inspect`
  - [x] 12.1 Create `src/app/api/inspect/route.ts` — implement `POST` handler (orchestration pipeline)
    - Step 1: Parse and Zod-validate request body with `inspectRequestSchema`; return 400 on failure
    - Step 2: **Safety Layer — context-answer check (always runs, BEFORE the rate limit)**: call `checkEmergency({ contextAnswers, bedrockOutput: undefined })`; if `isEmergency: true` → skip steps 3–6 (do NOT call `checkRateLimit`, do NOT increment the rate-limit counter, do NOT invoke Bedrock), assemble the emergency `InspectionResult` (step 7), persist to DynamoDB (step 8), return it with HTTP 200 (step 9), even when the visitor is over the daily limit of 15
    - Step 3: Only when no emergency was detected in step 2: call `checkRateLimit(request)`; if `allowed: false` → return HTTP 429 with friendly message and `Retry-After` header before invoking Bedrock
    - Step 4: Invoke `invokeInspectionModel` with 20-second timeout; on timeout or service error → return HTTP 502 with message "We couldn't analyse your photos. Please try again." (step 2 found no emergency, otherwise this step is never reached)
    - Step 5: Zod-validate Bedrock response with `bedrockResponseSchema`; on failure → return HTTP 502 with same retry message
    - Step 6: **Safety Layer — post-Bedrock merge**: call `checkEmergency({ contextAnswers, bedrockOutput: likelyIssue + jobBrief })`; merge with step 2 result (either source triggering emergency is sufficient)
    - Step 7: Call `applyOverrides`; assemble `InspectionResult` with UUID and ISO 8601 timestamp (emergency requests from step 2 arrive here directly)
    - Step 8: Persist to DynamoDB unconditionally (every job, including emergency results; DynamoDB failure is non-fatal — log and continue)
    - Step 9: Return `InspectionResult` JSON
    - _Requirements: 6.1, 6.3, 6.6, 6.7, 6.8, 6.9, 6.10, 8.1, 8.4, 8.5, 8.6, 8.7, 11.1, 11.2, 11.8, 14.1_
  - [x] 12.2 Write integration test: rate limit exceeded (Vitest with mocked AWS clients)
    - POST with clean context answers (no Emergency_Trigger phrases) as visitor with count ≥ 15; verify HTTP 429 response with friendly message; verify Bedrock was never invoked
    - _Requirements: 11.1, 11.2_
  - [x] 12.3 Write integration test: emergency trigger in context answers (Vitest with mocked AWS clients)
    - POST with location containing `'gas smell'`; verify response has `urgency: 'emergency'`, `isEmergency: true`, suppressed fields; verify Bedrock was **never invoked** (emergency detected in context answers during step 2, before the rate limit; Bedrock skipped)
    - _Requirements: 6.1–6.7_
  - [x] 12.4 Write integration test: emergency trigger in Bedrock output (Vitest with mocked AWS clients)
    - POST with clean context answers; mock Bedrock response containing `'carbon monoxide alarm'` in `jobBrief`; verify Safety Layer override applied post-Bedrock
    - _Requirements: 6.1, 6.3_
  - [x] 12.5 Write integration test: Bedrock Zod validation failure (Vitest with mocked AWS clients)
    - Mock Bedrock returning invalid JSON; verify 502 response with correct message
    - _Requirements: 8.4, 8.5_
  - [x] 12.6 Write integration test: Bedrock timeout (Vitest with mocked AWS clients)
    - Mock Bedrock not responding within 20 s; verify 502 response
    - _Requirements: 8.7_
  - [x] 12.7 Write integration test: emergency trigger in context answers with Bedrock failing (Vitest with mocked AWS clients)
    - POST with location `'carbon monoxide alarm'`; mock Bedrock to reject (service error and timeout); verify HTTP 200 with `urgency: 'emergency'` and `isEmergency: true` (the emergency check runs in step 2 before Bedrock, so Bedrock is never invoked); verify a 502 is NOT returned and the failing Bedrock mock is never called
    - _Requirements: 6.8, 6.9_
    - Tag: integration test
  - [x] 12.8 Write integration test: Bedrock fails with no safety trigger (Vitest with mocked AWS clients)
    - POST with clean context answers (no trigger phrases); mock Bedrock to return a service error; verify HTTP 502 response with body containing message 'We couldn't analyse your photos. Please try again.'
    - _Requirements: 6.8_
    - Tag: integration test
  - [x] 12.9 Write property test for safety trigger invariant across Bedrock outcomes (Property 21)
    - **Property 21: Safety trigger in context answers produces emergency regardless of Bedrock outcome**
    - **Validates: Requirements 6.1, 6.3, 6.8, 6.9**
    - Use `fc.record(ContextAnswersArb)` where location contains an injected trigger phrase; test three scenarios: (a) `bedrockOutput: undefined` (pre-Bedrock call), (b) `bedrockOutput` set to a valid Bedrock response string, (c) `bedrockOutput` set to a string representing invalid/malformed JSON; verify `checkEmergency` returns `isEmergency: true` in all three cases
    - Tag: `// Feature: intake-and-triage, Property 21: Safety trigger in context answers produces emergency regardless of Bedrock outcome`
  - [x] 12.10 Write integration test: emergency in context answers while over the daily limit (Vitest with mocked AWS clients)
    - POST with a visitor whose rate-limit counter is at or over 15 and location containing `'gas smell'`
    - Verify HTTP 200 (not 429) with `urgency: 'emergency'`, `isEmergency: true`, suppressed fields (cost range, job brief, DIY steps), and the exact emergency message data
    - Verify Bedrock was never invoked and the rate-limit counter was not incremented (`incrementRateLimitCounter` not called)
    - Verify the emergency result was still persisted to DynamoDB
    - _Requirements: 6.1-6.7, 11.8_

- [x] 13. Route Handler: `GET /api/inspections/[id]`
  - [x] 13.1 Create `src/app/api/inspections/[id]/route.ts` — implement `GET` handler
    - Extract `id` from path params
    - Call `getInspection(id)` — `GetItem` with `PK = JOB#{id}`, `SK = JOB#{id}`
    - If item not found → return HTTP 404 `{ "error": "Inspection not found" }`
    - The read is strongly consistent (`getInspection` uses `ConsistentRead: true`) because the results page reads a job immediately after it is saved
    - Parse stored `result` blob through `inspectionResultSchema` (which accepts emergency results, see 20.1); if validation fails → return HTTP 500
    - Return validated `InspectionResult` JSON with HTTP 200
    - _Requirements: 14.3, 14.4, 13.4_
  - [x] 13.2 Write integration tests for `GET /api/inspections/[id]` (Vitest with mocked AWS clients)
    - Happy path: valid UUID, DynamoDB returns stored result → 200 with `InspectionResult`
    - Emergency result: stored emergency result (`costRangeLow` 0, `costRangeHigh` 0, empty `jobBrief`, empty `diySteps`, `urgency: 'emergency'`, `isEmergency: true`) → 200 with the same result (required case)
    - Not found: DynamoDB returns no item → 404
    - Verify the `getInspection` read is issued with `ConsistentRead: true`
    - _Requirements: 13.3, 14.3, 14.4_

- [x] 14. Checkpoint — Server pipeline verified
  - Ensure all Route Handler, Rate Limiter, and Safety Layer tests pass. Ask the user if any questions arise.

- [x] 15. Upload UI components
  - [x] 15.1 Create `src/components/upload/DropZone.tsx`
    - Accept drag-and-drop and file-picker interactions
    - Enforce validation order: unsupported type → mixed media → multiple videos → image count > 5 → image file size > 10 MB (10 485 760 bytes) → video duration > 30 s
    - No file-size cap on video files
    - When video selected: invoke `extractFrames`; on timeout/error display appropriate error with Retry or Switch-to-photos action
    - Call `onFilesAccepted` with `AcceptedFiles` or `onValidationError` with `UploadValidationError[]`
    - Display selected file names and count summary
    - Component supports Normal and Haunted Tailwind themes via the active theme class on the root element
    - _Requirements: 1.1–1.8, 3.4, 3.5_
  - [x] 15.2 Write property test for file type validation (Property 1)
    - **Property 1: File type validation rejects exactly the non-allowed MIME types**
    - **Validates: Requirements 1.1**
    - Use `fc.string()` for arbitrary MIME type; `fc.constantFrom('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')` for allowed types; verify acceptance/rejection
    - Tag: `// Feature: intake-and-triage, Property 1: File type validation rejects exactly the non-allowed MIME types`
  - [x] 15.3 Write property test for mixed-media rejection (Property 2)
    - **Property 2: Mixed-media submissions are always rejected**
    - **Validates: Requirements 1.3**
    - Combine `fc.array(imageFile)` min 1 with `fc.array(videoFile)` min 1; verify always rejected
    - Tag: `// Feature: intake-and-triage, Property 2: Mixed-media submissions are always rejected`
  - [x] 15.4 Write property test for image count constraint (Property 3)
    - **Property 3: Image count constraint**
    - **Validates: Requirements 1.2**
    - Use `fc.array(imageFile, { minLength: 1, maxLength: 20 })`; verify accepted iff count ≤ 5
    - Tag: `// Feature: intake-and-triage, Property 3: Image count constraint`
  - [x] 15.5 Write property test for video duration constraint (Property 4)
    - **Property 4: Video duration constraint**
    - **Validates: Requirements 1.4**
    - Use `fc.float({ min: 0, max: 60 })`; verify accepted iff duration ≤ 30
    - Tag: `// Feature: intake-and-triage, Property 4: Video duration constraint`
  - [x] 15.6 Write property test for image file size constraint (Property 5)
    - **Property 5: Image file size constraint**
    - **Validates: Requirements 1.8**
    - Use `fc.integer({ min: 0, max: 20_000_000 })` for size; verify image rejected when size > 10 485 760 bytes (10 MB)
    - Tag: `// Feature: intake-and-triage, Property 5: Image file size constraint`
  - [x] 15.7 Create `src/components/upload/UploadProgress.tsx`
    - Display per-file name, progress percentage, and status (`pending` | `uploading` | `done` | `error`)
    - _Requirements: 10.1_
  - [x] 15.8 Create `src/components/upload/ContextForm.tsx`
    - Three text fields: location (required), duration (optional), recentChanges (optional)
    - Question (c) text: "Anything else we should know? For example smells, sounds, sparks or recent changes." (field name stays `recentChanges`)
    - Real-time character counter (`{n}/500`) for each field; block input beyond 500 chars
    - Inline error on location if submitted empty or whitespace-only
    - _Requirements: 5.1–5.5_
  - [x] 15.9 Write property test for context answer payload inclusion (Property 9)
    - **Property 9: All three context answers are always included in the submission payload**
    - **Validates: Requirements 5.4**
    - Use `fc.record({ location: fc.string(), duration: fc.string(), recentChanges: fc.string() })`; verify all three fields present in submitted payload with original values
    - Tag: `// Feature: intake-and-triage, Property 9: All three context answers are always included in the submission payload`
  - [x] 15.10 Write property test for character limit enforcement (Property 10)
    - **Property 10: Character count limit enforcement**
    - **Validates: Requirements 5.5**
    - Use `fc.string({ minLength: 501, maxLength: 2000 })`; verify only first 500 chars accepted and counter shows `500/500`
    - Tag: `// Feature: intake-and-triage, Property 10: Character count limit enforcement`
  - [x] 15.11 Create `src/components/upload/DataRetentionNotice.tsx`
    - Plain-language notice stating media stored privately and deleted after 30 days; 8th-grade reading level, no jargon
    - Use `IntersectionObserver` with `threshold: 0.9`; fire `onVisible` callback once when 90% visible
    - _Requirements: 2.1–2.5, 12.1, 12.2_
  - [x]* 15.12 Write unit test for `DataRetentionNotice` using Vitest
    - Mock `IntersectionObserver`; verify `onVisible` fires exactly once on first intersection
    - Verify `onVisible` does not fire again on subsequent intersections
    - _Requirements: 2.3, 2.4_

- [x] 16. Custom hooks
  - [x] 16.1 Create `src/hooks/useUpload.ts`
    - Orchestrates full client-side upload flow: validate answers → `GET /api/upload-url` per file → PUT to pre-signed URL → `POST /api/inspect`
    - Tracks `uploadStatus`: `'idle' | 'uploading' | 'analysing' | 'done' | 'error'`
    - 60-second client-side timeout: abort fetch, set error state with "try again" option
    - On success: store the full `POST /api/inspect` response (the `InspectionResult` JSON) in `sessionStorage` under `hhi_result_{id}` (use the result's `id`) by calling `cacheResult(result)` from `src/lib/sessionResultCache.ts` BEFORE navigating to `/inspect/[id]`; a storage failure must not block navigation
    - Expose `reset()` to restore previously selected files on retry
    - Create the small helper module `src/lib/sessionResultCache.ts` in this task (used by `useUpload` and `useInspection`): export `cacheResult(result: InspectionResult): void` (writes `JSON.stringify(result)` under key `hhi_result_{result.id}`, swallowing storage errors) and `readCachedResult(id: string): InspectionResult | null` (reads the key, parses JSON, validates with `inspectionResultSchema`; returns `null` when missing, invalid JSON, schema-invalid, or when `sessionStorage` throws)
    - _Requirements: 4.1–4.5, 10.1–10.4, 14.6_
  - [x] 16.2 Create `src/hooks/useInspection.ts`
    - Reads the session cache first via `readCachedResult(id)`; if a valid cached result exists, expose it immediately (`loading: false`)
    - Falls back to / continues with `GET /api/inspections/[id]`: with no cached copy the GET is the source of the result; with a cached copy the GET is still issued in the background and, if it succeeds, its validated result replaces the cached copy (refresh via `cacheResult`)
    - A GET failure, 404, or schema-invalid response does NOT hide a valid cached result (keep `result`, do not set `error`); this keeps the result, and especially the emergency banner, visible if the DynamoDB save failed (non-fatal) or the read is slow
    - Shared links (new browser or tab, another person) have no cached copy and use GET only; `sessionStorage` is per-tab, cleared when the tab closes, and holds only the current visitor's own inspection; no guest branching, every job is still persisted server-side
    - Exposes `{ result, loading, error }`; with no cached result, a 404 yields a not-found state and a schema-invalid response sets `error` (no partial display)
    - _Requirements: 13.2, 13.4, 14.3, 14.7, 14.8, 14.9_
  - [x] 16.3 Write unit tests for the session cache helpers (`src/lib/sessionResultCache.ts`)
    - Write then read round-trip: `cacheResult(r)` then `readCachedResult(r.id)` returns an equal result (include an emergency-shaped result)
    - Invalid JSON in the stored entry is ignored (`null`)
    - Schema-invalid entry is ignored (`null`)
    - `sessionStorage` throwing on get and on set is ignored (no exception; `readCachedResult` returns `null`)
    - Key format is exactly `hhi_result_{id}`
    - _Requirements: 14.6, 14.7, 14.8_

- [x] 17. Checkpoint — Upload pipeline and hooks verified
  - Ensure all upload component tests and hook logic compile correctly. Ask the user if any questions arise.

- [ ] 18. Results UI components
  - [x] 18.1 Create `src/components/results/UrgencyBadge.tsx`
    - Render exact labels: `emergency` → "Emergency" (red), `urgent` → "Urgent — act today" (orange), `soon` → "Soon — within a week" (yellow), `monitor` → "Monitor — keep an eye on it" (green)
    - Use `urgencyLabel` utility internally
    - Supports Normal and Haunted Tailwind themes via active theme class at layout level
    - _Requirements: 9.2_
  - [ ]* 18.2 Write unit test for `UrgencyBadge` rendering using Vitest
    - Verify all four urgency levels render the exact expected strings with correct Tailwind colour classes
    - _Requirements: 9.2_
  - [ ] 18.3 Create `src/components/results/EmergencyBanner.tsx`
    - Rendered only when `urgency === 'emergency'`
    - Display exactly: "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside."
    - _Requirements: 6.4_
  - [ ] 18.4 Write unit test for `EmergencyBanner` using Vitest
    - Verify banner renders with the exact required message when `urgency === 'emergency'`
    - Verify banner does not render for other urgency levels
    - _Requirements: 6.4_
  - [ ] 18.5 Create `src/components/results/CostRange.tsx`
    - Display `costRangeLow`–`costRangeHigh` in Canadian dollars (CAD) via `formatCurrency`, e.g. `CA$1,200`; no currency selector
    - Mandatory label "rough range, not a quote" beneath
    - Hidden entirely when `urgency === 'emergency'`
    - Supports Normal and Haunted Tailwind themes via active theme class at layout level
    - _Requirements: 9.4, 9.8, 6.5_
  - [ ]* 18.6 Write unit test for `CostRange` with emergency props using Vitest
    - Verify CostRange renders normally for non-emergency urgency
    - Verify CostRange is not rendered when `urgency === 'emergency'`
    - Verify costs render in CAD with no decimals (e.g. `CA$1,200`) and the "rough range, not a quote" label is always present
    - _Requirements: 6.5, 9.4, 9.8_
  - [ ] 18.7 Create `src/components/results/JobBrief.tsx`
    - Render `jobBrief` text with one-click "Copy" button
    - On clipboard success: show "Copied!" for at least 2 seconds
    - On clipboard failure: switch to selectable `<textarea>` with manual copy instruction
    - Hidden entirely when `urgency === 'emergency'`
    - _Requirements: 9.6, 9.7, 6.5_
  - [ ]* 18.8 Write unit test for `JobBrief` using Vitest
    - Test clipboard success path: "Copied!" indicator appears and persists for ≥ 2 s
    - Test clipboard failure path: `<textarea>` fallback renders with copy instruction
    - Test hidden when `urgency === 'emergency'`
    - _Requirements: 9.6, 9.7, 6.5_
  - [ ] 18.9 Create `src/components/results/IssueSummary.tsx`
    - Display `likelyIssue`, `trade`, two `followUpQuestions`
    - Plain text; no urgency colour; no DIY steps shown when `diySteps` array is empty
    - _Requirements: 9.1_
  - [ ] 18.10 Write property test for emergency field suppression (Property 13)
    - **Property 13: Emergency results never contain cost range, job brief, or DIY steps**
    - **Validates: Requirements 6.5**
    - Generate `InspectionResult` with `urgency === 'emergency'` using `fast-check`; render the Results Page components; verify cost range, job brief, and DIY steps are absent from the rendered output
    - Tag: `// Feature: intake-and-triage, Property 13: Emergency results never contain cost range, job brief, or DIY steps`

- [ ] 19. Pages
  - [ ] 19.1 Create root layout `src/app/layout.tsx`
    - Import global Tailwind styles; set up font and global providers
    - Apply root theme class to support Normal and Haunted theme variants across all components
    - _Requirements: all (foundational)_
  - [ ] 19.2 Create home page `src/app/page.tsx`
    - Prominent upload CTA: "Upload a photo or video of your problem"
    - Compose `DropZone`, `ContextForm`, `DataRetentionNotice`, `UploadProgress` using `useUpload` hook
    - Submit button disabled until `DataRetentionNotice` has been visible AND location answer is non-empty
    - If user attempts submit before notice is visible: scroll notice into view and show inline prompt
    - Loading state: display "Inspecting your home…" while `uploadStatus === 'analysing'`
    - Error state: display error message with "Try again" action restoring previously selected files
    - All components respond to Normal and Haunted Tailwind themes via the root theme class
    - _Requirements: 2.3–2.5, 5.1–5.5, 10.1–10.4_
  - [ ] 19.3 Create results page `src/app/inspect/[id]/page.tsx`
    - Use `useInspection(id)` hook: it shows a valid session-cached result immediately and also fetches a fresh copy from `GET /api/inspections/[id]`; if the fetch of a fresh copy fails, keep showing the cached result (including the emergency banner)
    - Compose `EmergencyBanner`, `UrgencyBadge`, `IssueSummary`, `CostRange`, `JobBrief`
    - Display confidence as `formatConfidence(result.confidence)` labelled "AI confidence in this diagnosis"
    - On result not found (404): render message "Result could not be found" with option to start a new inspection, ONLY when there is neither a cached nor a fetched result
    - On deserialisation failure with no valid cached result: render error message only (no partial display)
    - All components respond to Normal and Haunted Tailwind themes via the root theme class
    - _Requirements: 9.1–9.7, 13.4, 14.3, 14.4, 14.7, 14.8_

- [ ] 20. InspectionResult serialisation round-trip
  - [x] 20.1 Add and export `inspectionResultSchema` to `src/lib/validation/inspectionSchema.ts` (full Zod schema for `InspectionResult`)
    - Used for deserialisation validation in the `useInspection` hook, the session cache helper (`readCachedResult`), and `GET /api/inspections/[id]`
    - MUST accept emergency results: `costRangeLow` 0, `costRangeHigh` 0, `jobBrief` `''` (empty string), `diySteps` `[]`, `urgency` `'emergency'`, `isEmergency` `true`
    - `jobBrief: z.string().max(1000)` (empty allowed; do NOT require `min(1)`); `costRangeLow` / `costRangeHigh` `z.number().min(0).max(999999)`; keep the `costRangeHigh >= costRangeLow` refinement so 0/0 passes
    - _Requirements: 13.1, 13.2, 13.4_
  - [x] 20.2 Write property test for round-trip serialisation (Property 18)
    - **Property 18: InspectionResult serialisation round-trip**
    - **Validates: Requirements 13.3**
    - Generate valid `InspectionResult` objects with `fast-check` (`ValidInspectionResultArb` MUST include the emergency shape: costs 0/0, empty `jobBrief`, empty `diySteps`, `urgency: 'emergency'`, `isEmergency: true`); `JSON.parse(JSON.stringify(x))` then `inspectionResultSchema.parse`; verify every field value and type is identical to original
    - Tag: `// Feature: intake-and-triage, Property 18: InspectionResult serialisation round-trip`
  - [ ] 20.3 Write property test for every-job-persisted (Property 17)
    - **Property 17: Every job is always persisted**
    - **Validates: Requirements 14.1**
    - Spy on `persistInspection`; generate `InspectionSubmission` using `fast-check`; verify `persistInspection` is called exactly once for every submission regardless of visitor identity or session state
    - Tag: `// Feature: intake-and-triage, Property 17: Every job is always persisted`
  - [x] 20.4 Write unit test: emergency result round-trips through `inspectionResultSchema`
    - An emergency result produced by the `POST /api/inspect` context-answer path (the 12.3 path, via `applyOverrides` with the placeholder) goes `JSON.stringify` → `JSON.parse` → `inspectionResultSchema.safeParse` with success, and the parsed value deep-equals the original
    - Assert the emergency shape: `costRangeLow` 0, `costRangeHigh` 0, `jobBrief` `''`, `diySteps` `[]`, `urgency` `'emergency'`, `isEmergency` `true`
    - _Requirements: 6.7, 13.3_

- [ ] 21. Final checkpoint — All tests pass
  - Ensure all property-based tests, unit tests, and integration tests pass. Run `next lint` and `tsc --noEmit`. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery; optional tasks are the UI unit tests for non-emergency components: 7.2, 9.3, 10.4, 11.2, 15.12, 18.2, 18.6, 18.8
- Each task references specific requirements for traceability
- The Safety Layer (tasks 5.x) must be implemented and verified before the `POST /api/inspect` route handler (task 12.x)
- In `POST /api/inspect`, the Safety Layer context-answer check runs BEFORE the rate limit: emergency requests bypass the rate limiter entirely, so they are never blocked by and never counted against the daily limit of 15 (a life-safety message must never be blocked by a usage limit); the emergency result is still persisted and the job link works as usual (task 12.10)
- The `server-only` package must be imported at the top of every file in `src/lib/aws/`, `src/lib/safety/`, and `src/lib/rateLimiter.ts` to prevent accidental client-side imports
- All tests use **Vitest**; property-based tests use **fast-check**; integration tests use **Vitest with mocked AWS clients** (the AWS client modules are mocked at module level; MSW is not used for these tests)
- Tag format for each property test: `// Feature: intake-and-triage, Property {N}: {property title}`
- DynamoDB write failures in `POST /api/inspect` are non-fatal — return the result to the client and log the error
- All AWS singleton clients use `APP_AWS_REGION` as the sole region parameter; there are no separate per-service region variables
- The default Bedrock model is Amazon Nova Lite; use the cross-region inference profile ID (prefixed `us.`) for on-demand calls in us-east-2
- All costs labelled "rough range, not a quote"; all confidence values prefixed with `~`
- All costs are Canadian dollars (CAD) for Ontario homeowners: Bedrock is asked for CAD, CAD is stored and displayed, and amounts format as `CA$1,200` with no decimals
- The Bedrock call timeout is 20 seconds because Amplify stops server requests at 30 seconds, leaving time to return the emergency message when Bedrock is slow
- Image blocks sent to Bedrock take their format (jpeg, png or webp) from the S3 Content-Type, falling back to the key's file extension
- All UI components support the Normal and Haunted Tailwind themes via the root layout theme class
- Video max duration is 30 seconds; image max size is 10 MB (10 485 760 bytes); there is no file-size cap on video files
- Every job is persisted to DynamoDB unconditionally — no authentication check, no guest/authenticated branching
- `getInspection` uses `ConsistentRead: true` because the results page reads a job immediately after it is saved (task 8.3 is already complete; the bullet was added to its text and the change will be reopened separately)
- `inspectionResultSchema` (task 20.1) must accept emergency results (costs 0/0, empty `jobBrief`, empty `diySteps`); tests 13.2, 20.2 and 20.4 cover this
- Session cache: `useUpload` stores the `POST /api/inspect` result in `sessionStorage` under `hhi_result_{id}` before navigating; `useInspection` shows a valid cached result immediately and still fetches `GET /api/inspections/[id]`; a GET failure or 404 does not hide a valid cached result. The read/write logic lives in `src/lib/sessionResultCache.ts` (`cacheResult`, `readCachedResult`), created in 16.1 and tested in 16.3. `sessionStorage` is per-tab and holds only the current visitor's own result; shared links use GET only

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "4.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["3.3", "3.4", "4.4", "4.5", "5.1", "7.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "7.2", "8.1", "8.2", "8.3", "9.1", "10.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "10.2", "10.3", "10.4", "11.1"] },
    { "id": 5, "tasks": ["11.2", "12.1", "20.1"] },
    { "id": 6, "tasks": ["12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9", "12.10", "13.1", "15.1", "16.1", "20.2", "20.4"] },
    { "id": 7, "tasks": ["13.2", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7", "15.8", "15.9", "15.10", "15.11", "15.12", "16.2", "16.3", "18.1", "18.3", "18.5", "18.7", "18.9"] },
    { "id": 8, "tasks": ["18.2", "18.4", "18.6", "18.8", "18.10", "19.1"] },
    { "id": 9, "tasks": ["19.2", "19.3", "20.3"] }
  ]
}
```
