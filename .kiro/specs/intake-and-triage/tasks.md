# Implementation Plan: Intake and Triage

## Overview

Implement the end-to-end intake-and-triage flow for Haunted House Inspector: project scaffolding, shared types, Zod schemas, AWS singletons, Safety Layer, Bedrock prompt, frame extractor, Route Handlers, upload and results UI components, custom hooks, pages, and the full test suite (property-based, unit, and integration).

## Tasks

- [ ] 1. Project scaffolding and configuration
  - Initialise a Next.js App Router project with TypeScript strict mode (`"strict": true` in `tsconfig.json`)
  - Configure `@/` path alias in `tsconfig.json` pointing to `src/`
  - Install and configure Tailwind CSS; add design tokens to `tailwind.config.ts`
  - Create `amplify.yml` build spec for AWS Amplify Hosting
  - Create `.env.example` with all required variable keys (`BEDROCK_MODEL_ID`, `BEDROCK_REGION`, `S3_BUCKET_NAME`, `S3_REGION`, `DYNAMODB_TABLE_NAME`, `DYNAMODB_REGION`, `NEXT_PUBLIC_APP_URL`); add `.env.local` to `.gitignore`
  - Scaffold the directory tree: `src/app/`, `src/components/`, `src/lib/`, `src/types/`, `src/hooks/`
  - Install `server-only`, `zod`, `@aws-sdk/client-s3`, `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-dynamodb`, `@aws-sdk/s3-request-presigner`, `aws-amplify`
  - Install dev dependencies: `jest`, `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`, `vitest`, `msw`
  - _Requirements: all (foundational)_

- [ ] 2. Shared TypeScript types
  - [ ] 2.1 Create `src/types/inspection.ts` — export `UrgencyLevel`, `ContextAnswers`, `InspectionResult`
    - `UrgencyLevel = 'emergency' | 'urgent' | 'soon' | 'monitor'`
    - `ContextAnswers` with `location`, `duration`, `recentChanges` string fields
    - `InspectionResult` with all fields from the design: `id`, `userId`, `createdAt`, `s3Keys`, `likelyIssue`, `trade`, `urgency`, `confidence`, `costRangeLow`, `costRangeHigh`, `jobBrief`, `followUpQuestions`, `diySteps`, `isEmergency`, `answers`
    - _Requirements: 8.3, 9.1, 13.1_
  - [ ] 2.2 Create `src/types/bedrock.ts` — export `BedrockInspectionResponse`
    - Matches the raw Claude JSON structure; `urgency` is `'urgent' | 'soon' | 'monitor'` only (no `'emergency'`)
    - _Requirements: 8.3_

- [ ] 3. Zod validation schemas
  - [ ] 3.1 Create `src/lib/validation/uploadSchema.ts` — export `uploadUrlRequestSchema`
    - Validates `filename` (string), `contentType` (enum of accepted MIME types), `inspectionId` (UUID string)
    - _Requirements: 4.1, 4.2_
  - [ ] 3.2 Create `src/lib/validation/inspectionSchema.ts` — export `contextAnswersSchema`, `inspectRequestSchema`, `bedrockResponseSchema`
    - `contextAnswersSchema`: `location` min 1, all fields max 500, optional defaults for `duration` and `recentChanges`
    - `bedrockResponseSchema`: all field types, ranges, and the `costRangeHigh >= costRangeLow` refinement
    - `inspectRequestSchema`: `s3Keys` array (1–5 non-empty strings), `answers: contextAnswersSchema`
    - _Requirements: 5.2, 5.5, 8.3, 8.4_
  - [ ]* 3.3 Write property test for `bedrockResponseSchema` (Property 19)
    - **Property 19: Zod schema correctly classifies Bedrock responses**
    - **Validates: Requirements 8.3, 8.4**
    - Use `fc.object()` (arbitrary JSON); verify `safeParse` returns `success: true` iff all constraints are met
    - Tag: `// Feature: intake-and-triage, Property 19: Zod schema classification`
  - [ ]* 3.4 Write property test for `contextAnswersSchema` whitespace location (Property 8)
    - **Property 8: Whitespace-only location answer is invalid**
    - **Validates: Requirements 5.2**
    - Use `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` for location
    - Tag: `// Feature: intake-and-triage, Property 8: Whitespace-only location answer is invalid`

- [ ] 4. Utility functions
  - [ ] 4.1 Create `src/lib/utils/urgencyLabel.ts` — export `urgencyLabel(urgency: UrgencyLevel): string`
    - Maps all four values to the exact plain-English labels from the design
    - _Requirements: 9.2_
  - [ ] 4.2 Create `src/lib/utils/formatCurrency.ts` — export `formatCurrency(amount: number, locale?: string): string`
    - Formats numbers as local currency for cost range display
    - _Requirements: 9.4_
  - [ ] 4.3 Create `src/lib/utils/formatConfidence.ts` — export `formatConfidence(confidence: number): string`
    - Returns `~{Math.round(c * 100)}%` for any c in [0, 1]
    - _Requirements: 9.3, 9.5_
  - [ ]* 4.4 Write property test for `urgencyLabel` (Property 15)
    - **Property 15: Urgency label mapping is exhaustive and exact**
    - **Validates: Requirements 9.2**
    - Use `fc.constantFrom('emergency', 'urgent', 'soon', 'monitor')`; verify no value returns `undefined` or empty string and each maps to the exact specified string
    - Tag: `// Feature: intake-and-triage, Property 15: Urgency label mapping is exhaustive and exact`
  - [ ]* 4.5 Write property test for `formatConfidence` (Property 16)
    - **Property 16: Confidence formatting always produces a tilde-prefixed percentage**
    - **Validates: Requirements 9.3, 9.5**
    - Use `fc.float({ min: 0, max: 1 })`; verify result starts with `~`, ends with `%`, numeric portion equals `Math.round(c * 100)`
    - Tag: `// Feature: intake-and-triage, Property 16: Confidence formatting always produces a tilde-prefixed percentage`

- [ ] 5. Safety Layer
  - [ ] 5.1 Create `src/lib/safety/safetyLayer.ts` — export `checkEmergency` and `applyOverrides`
    - `checkEmergency(input: SafetyCheckInput): SafetyCheckResult` — case-insensitive substring matching with 200-char proximity window for all four `EmergencyConditionCode` values
    - `applyOverrides(bedrockResult, safetyResult, trade): InspectionResult` — sets `urgency = 'emergency'`, zeros/clears cost and job brief, empties `diySteps` for emergency; empties `diySteps` for `electrician` / `gas engineer` trade regardless of urgency
    - Pure module: no I/O, no async, no Bedrock dependency; guard with `server-only`
    - _Requirements: 6.1–6.7, 7.1_
  - [ ]* 5.2 Write property test for `checkEmergency` (Property 11)
    - **Property 11: Emergency detection on any trigger-containing text**
    - **Validates: Requirements 6.1, 6.2**
    - Use `fc.string()` and inject trigger phrase at a random position; verify `isEmergency: true`; use clean `fc.string()` without triggers for negative case
    - Tag: `// Feature: intake-and-triage, Property 11: Emergency detection on any trigger-containing text`
  - [ ]* 5.3 Write property test for emergency urgency override (Property 12)
    - **Property 12: Emergency urgency override is unconditional**
    - **Validates: Requirements 6.3, 6.7**
    - Use `fc.record(BedrockResponseArb)` with emergency context; verify `applyOverrides` always sets `urgency = 'emergency'`
    - Tag: `// Feature: intake-and-triage, Property 12: Emergency urgency override is unconditional`
  - [ ]* 5.4 Write property test for DIY suppression by trade (Property 14)
    - **Property 14: DIY steps suppressed for dangerous trades**
    - **Validates: Requirements 7.1**
    - Use `fc.constantFrom('electrician', 'gas engineer')` as trade with arbitrary `diySteps`; verify result has empty `diySteps`
    - Tag: `// Feature: intake-and-triage, Property 14: DIY steps suppressed for dangerous trades`
  - [ ]* 5.5 Write unit tests for `checkEmergency` and `applyOverrides`
    - Test all four emergency condition codes with exact trigger phrases and case variants
    - Test proximity boundary (within 200 chars vs. beyond 200 chars)
    - Test non-trigger inputs return `isEmergency: false`
    - Test emergency field suppression: cost range, job brief, DIY steps all cleared
    - _Requirements: 6.1–6.7, 7.1_

- [ ] 6. Checkpoint — Safety Layer verified
  - Ensure all Safety Layer tests pass. Ask the user if any questions arise.

- [ ] 7. Bedrock prompt template
  - [ ] 7.1 Create `src/lib/prompts/inspectPrompt.ts` — export `buildInspectPrompt(ctx: InspectPromptContext): string`
    - Instructs Claude to analyse images for visible home defects, use context answers, return JSON matching `BedrockInspectionResponse` exactly
    - Must instruct Claude to never return `urgency: 'emergency'`
    - Must instruct Claude to use non-technical language and label costs as estimates with confidence as a decimal 0–1
    - _Requirements: 8.1–8.3_
  - [ ]* 7.2 Write unit snapshot test for `buildInspectPrompt`
    - Snapshot test of rendered prompt for a known `InspectPromptContext` input
    - Verify prompt contains JSON schema instructions
    - _Requirements: 8.2, 8.3_

- [ ] 8. AWS SDK singletons
  - [ ] 8.1 Create `src/lib/aws/s3.ts` — export `s3Client` singleton and `getUploadPresignedUrl` / `getDownloadPresignedUrl` functions
    - Use `S3_BUCKET_NAME` and `S3_REGION` from `process.env`; guard with `server-only`
    - `getUploadPresignedUrl` uses `PutObjectCommand` with `expiresIn: 900`
    - _Requirements: 4.2, 4.4_
  - [ ] 8.2 Create `src/lib/aws/bedrock.ts` — export `invokeInspectionModel(s3Keys, answers): Promise<BedrockInspectionResponse>`
    - Use `BEDROCK_MODEL_ID` (default `anthropic.claude-3-sonnet-20240229-v1:0`) and `BEDROCK_REGION` from `process.env`; guard with `server-only`
    - Fetch pre-signed GET URLs for S3 keys, build `messages` payload with image content blocks (base64 JPEG), call `InvokeModelCommand` with 30-second timeout signal
    - Returns raw parsed object; Zod validation is caller's responsibility
    - _Requirements: 8.1–8.3, 8.6, 8.7_
  - [ ] 8.3 Create `src/lib/aws/dynamodb.ts` — export `persistInspection` and `getInspection` functions
    - Use `DYNAMODB_TABLE_NAME` and `DYNAMODB_REGION` from `process.env`; guard with `server-only`
    - Single-table design: `PK = USER#{userId}`, `SK = INSPECTION#{createdAt}#{id}`; `ttl` field = createdAt + 30 days in Unix epoch
    - DynamoDB write failures are non-fatal (log error, return result to client anyway)
    - _Requirements: 11.4, 12.1_

- [ ] 9. Frame extractor
  - [ ] 9.1 Create `src/lib/frameExtractor.ts` — export `extractFrames(videoFile: File): Promise<FrameExtractionResult | FrameExtractionError>`
    - Use browser-native `HTMLVideoElement` and `CanvasRenderingContext2D` only; no third-party library
    - Duration ≥ 3 s: extract 3–5 evenly spaced frames; duration < 3 s: extract all whole-second frames (at least 1)
    - Scale canvas so shorter side ≥ 640 px; encode as JPEG at quality 0.82
    - Wrap entire operation in a 15-second `Promise.race` timeout; clean up `URL.createObjectURL` via `URL.revokeObjectURL`
    - _Requirements: 3.1–3.7_
  - [ ]* 9.2 Write property test for frame count (standard videos) (Property 6)
    - **Property 6: Frame count for standard-length videos**
    - **Validates: Requirements 3.1**
    - Use `fc.float({ min: 3, max: 60 })` for duration; mock `HTMLVideoElement`; verify 3–5 frames returned with evenly distributed timestamps
    - Tag: `// Feature: intake-and-triage, Property 6: Frame count for standard-length videos`
  - [ ]* 9.3 Write property test for frame count (short videos) (Property 7)
    - **Property 7: Frame count for short videos**
    - **Validates: Requirements 3.6**
    - Use `fc.float({ min: 0.001, max: 2.999 })` for duration; verify exactly `floor(d)` frames returned
    - Tag: `// Feature: intake-and-triage, Property 7: Frame count for short videos`
  - [ ]* 9.4 Write unit tests for `extractFrames`
    - Mock `HTMLVideoElement`; test standard duration (3–60 s), short duration (< 3 s), boundary at exactly 3 s
    - Test timeout after 15 s returns `TIMEOUT` error code
    - Test extraction processing error returns `PROCESSING_ERROR` code
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7_

- [ ] 10. Route Handler: `GET /api/upload-url`
  - [ ] 10.1 Create `src/app/api/upload-url/route.ts` — implement `GET` handler
    - Validate query params (`filename`, `contentType`, `inspectionId`) with `uploadUrlRequestSchema`
    - Resolve `userId` from Amplify Auth session; fall back to `guest/{sessionId}` for unauthenticated users
    - Build S3 key as `{userId}/{inspectionId}/{sanitised filename}`
    - Call `getUploadPresignedUrl` with `expiresIn: 900`; return `{ url, key }`
    - Return 400 on Zod validation failure; never expose AWS credentials
    - _Requirements: 4.1–4.5_
  - [ ]* 10.2 Write integration test for `GET /api/upload-url` using MSW
    - Happy path: valid params → returns `{ url, key }`
    - Invalid `contentType` → 400
    - S3 pre-sign failure → 500
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 11. Route Handler: `POST /api/inspect`
  - [ ] 11.1 Create `src/app/api/inspect/route.ts` — implement `POST` handler (orchestration pipeline)
    - Parse and Zod-validate request body with `inspectRequestSchema`; return 400 on failure
    - Safety Layer pre-check on context answers; if emergency detected, skip Bedrock and return emergency result immediately
    - Invoke `invokeInspectionModel` with 30-second timeout; return 504 on timeout, 502 on service error
    - Zod-validate Bedrock response with `bedrockResponseSchema`; return 502 on failure
    - Safety Layer post-check on Bedrock output (`likelyIssue` + `jobBrief`); merge with pre-check result
    - Call `applyOverrides`; assemble `InspectionResult` with UUID and ISO 8601 timestamp
    - If authenticated: call `persistInspection` (DynamoDB failure is non-fatal — log and continue)
    - Return `InspectionResult` JSON
    - _Requirements: 6.1, 6.6, 6.7, 8.1, 8.4, 8.5, 8.6, 8.7, 11.2, 11.4_
  - [ ]* 11.2 Write integration test: emergency trigger in context answers (MSW)
    - POST with location containing `'gas smell'`; verify response has `urgency: 'emergency'`, `isEmergency: true`, suppressed fields; verify Bedrock was never invoked
    - _Requirements: 6.1–6.7_
  - [ ]* 11.3 Write integration test: emergency trigger in Bedrock output (MSW)
    - POST with clean context answers; mock Bedrock response containing `'carbon monoxide alarm'` in `jobBrief`; verify override applied post-Bedrock
    - _Requirements: 6.1, 6.3_
  - [ ]* 11.4 Write integration test: Bedrock Zod validation failure (MSW)
    - Mock Bedrock returning invalid JSON; verify 502 response with correct message
    - _Requirements: 8.4, 8.5_
  - [ ]* 11.5 Write integration test: Bedrock timeout (MSW)
    - Mock Bedrock not responding within 30 s; verify 504 response
    - _Requirements: 8.7_
  - [ ]* 11.6 Write integration test: guest user flow (MSW)
    - POST as unauthenticated user; verify `persistInspection` (DynamoDB) is never called
    - _Requirements: 11.2_

- [ ] 12. Checkpoint — Server pipeline verified
  - Ensure all Route Handler and Safety Layer tests pass. Ask the user if any questions arise.

- [ ] 13. Upload UI components
  - [ ] 13.1 Create `src/components/upload/DropZone.tsx`
    - Accept drag-and-drop and file-picker interactions
    - Enforce validation order: unsupported type → mixed media → multiple videos → image count > 5 → file size → video duration
    - Image limit: 20 MB per file; video limit: 500 MB
    - When video selected: invoke `extractFrames`; on timeout/error display appropriate error with Retry or Switch-to-photos action
    - Call `onFilesAccepted` with `AcceptedFiles` or `onValidationError` with `UploadValidationError[]`
    - Display selected file names and count summary
    - _Requirements: 1.1–1.8, 3.4, 3.5_
  - [ ]* 13.2 Write property test for file type validation (Property 1)
    - **Property 1: File type validation rejects exactly the non-allowed MIME types**
    - **Validates: Requirements 1.1**
    - Use `fc.string()` for arbitrary MIME type; `fc.constantFrom('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')` for allowed types; verify acceptance/rejection
    - Tag: `// Feature: intake-and-triage, Property 1: File type validation rejects exactly the non-allowed MIME types`
  - [ ]* 13.3 Write property test for mixed-media rejection (Property 2)
    - **Property 2: Mixed-media submissions are always rejected**
    - **Validates: Requirements 1.3**
    - Combine `fc.array(imageFile)` min 1 with `fc.array(videoFile)` min 1; verify always rejected
    - Tag: `// Feature: intake-and-triage, Property 2: Mixed-media submissions are always rejected`
  - [ ]* 13.4 Write property test for image count constraint (Property 3)
    - **Property 3: Image count constraint**
    - **Validates: Requirements 1.2**
    - Use `fc.array(imageFile, { minLength: 1, maxLength: 20 })`; verify accepted iff count ≤ 5
    - Tag: `// Feature: intake-and-triage, Property 3: Image count constraint`
  - [ ]* 13.5 Write property test for video duration constraint (Property 4)
    - **Property 4: Video duration constraint**
    - **Validates: Requirements 1.4**
    - Use `fc.float({ min: 0, max: 120 })`; verify accepted iff duration ≤ 60
    - Tag: `// Feature: intake-and-triage, Property 4: Video duration constraint`
  - [ ]* 13.6 Write property test for file size constraint (Property 5)
    - **Property 5: File size constraint**
    - **Validates: Requirements 1.8**
    - Use `fc.integer({ min: 0, max: 600_000_000 })` for size; verify image rejected > 20 971 520 bytes, video rejected > 524 288 000 bytes
    - Tag: `// Feature: intake-and-triage, Property 5: File size constraint`
  - [ ] 13.7 Create `src/components/upload/UploadProgress.tsx`
    - Display per-file name, progress percentage, and status (`pending` | `uploading` | `done` | `error`)
    - _Requirements: 10.1_
  - [ ] 13.8 Create `src/components/upload/ContextForm.tsx`
    - Three text fields: location (required), duration (optional), recentChanges (optional)
    - Real-time character counter (`{n}/500`) for each field; block input beyond 500 chars
    - Inline error on location if submitted empty or whitespace-only
    - _Requirements: 5.1–5.5_
  - [ ]* 13.9 Write property test for context answer payload inclusion (Property 9)
    - **Property 9: All three context answers are always included in the submission payload**
    - **Validates: Requirements 5.4**
    - Use `fc.record({ location: fc.string(), duration: fc.string(), recentChanges: fc.string() })`; verify all three fields present in submitted payload with original values
    - Tag: `// Feature: intake-and-triage, Property 9: All three context answers are always included in the submission payload`
  - [ ]* 13.10 Write property test for character limit enforcement (Property 10)
    - **Property 10: Character count limit enforcement**
    - **Validates: Requirements 5.5**
    - Use `fc.string({ minLength: 501, maxLength: 2000 })`; verify only first 500 chars accepted and counter shows `500/500`
    - Tag: `// Feature: intake-and-triage, Property 10: Character count limit enforcement`
  - [ ] 13.11 Create `src/components/upload/DataRetentionNotice.tsx`
    - Plain-language notice stating media stored privately and deleted after 30 days; 8th-grade reading level, no jargon
    - Use `IntersectionObserver` with `threshold: 0.9`; fire `onVisible` callback once when 90% visible
    - _Requirements: 2.1–2.5, 12.1, 12.2_
  - [ ]* 13.12 Write unit test for `DataRetentionNotice`
    - Mock `IntersectionObserver`; verify `onVisible` fires exactly once on first intersection
    - Verify `onVisible` does not fire again on subsequent intersections
    - _Requirements: 2.3, 2.4_

- [ ] 14. Custom hooks
  - [ ] 14.1 Create `src/hooks/useUpload.ts`
    - Orchestrates full client-side upload flow: validate answers → `GET /api/upload-url` per file → PUT to pre-signed URL → `POST /api/inspect`
    - Tracks `uploadStatus`: `'idle' | 'uploading' | 'analysing' | 'done' | 'error'`
    - 60-second client-side timeout: abort fetch, set error state with "try again" option; on success navigate to `/inspect/[id]`
    - Expose `reset()` to restore previously selected files on retry
    - _Requirements: 4.1–4.5, 10.1–10.4_
  - [ ] 14.2 Create `src/hooks/useInspection.ts`
    - Fetches and caches inspection result for Results Page
    - For guest users: reads from session-local state store rather than a persisted API call
    - Exposes `{ result, loading, error }`
    - When deserialisation fails Zod schema: sets `error` (no partial display)
    - _Requirements: 11.3, 13.2, 13.4_

- [ ] 15. Checkpoint — Upload pipeline and hooks verified
  - Ensure all upload component tests and hook logic compile correctly. Ask the user if any questions arise.

- [ ] 16. Results UI components
  - [ ] 16.1 Create `src/components/results/UrgencyBadge.tsx`
    - Render exact labels: `emergency` → "Emergency" (red), `urgent` → "Urgent — act today" (orange), `soon` → "Soon — within a week" (yellow), `monitor` → "Monitor — keep an eye on it" (green)
    - Use `urgencyLabel` utility internally
    - _Requirements: 9.2_
  - [ ]* 16.2 Write unit test for `UrgencyBadge` rendering
    - Verify all four urgency levels render the exact expected strings with correct Tailwind colour classes
    - _Requirements: 9.2_
  - [ ] 16.3 Create `src/components/results/EmergencyBanner.tsx`
    - Rendered only when `urgency === 'emergency'`
    - Display exactly: "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside."
    - _Requirements: 6.4_
  - [ ]* 16.4 Write unit test for `EmergencyBanner`
    - Verify banner renders with the exact required message when `urgency === 'emergency'`
    - Verify banner does not render for other urgency levels
    - _Requirements: 6.4_
  - [ ] 16.5 Create `src/components/results/CostRange.tsx`
    - Display `costRangeLow`–`costRangeHigh` formatted via `formatCurrency`
    - Mandatory label "rough range, not a quote" beneath
    - Hidden entirely when `urgency === 'emergency'`
    - _Requirements: 9.4, 6.5_
  - [ ]* 16.6 Write unit test for `CostRange` with emergency props
    - Verify CostRange renders normally for non-emergency urgency
    - Verify CostRange is not rendered when `urgency === 'emergency'`
    - _Requirements: 6.5_
  - [ ] 16.7 Create `src/components/results/JobBrief.tsx`
    - Render `jobBrief` text with one-click "Copy" button
    - On clipboard success: show "Copied!" for at least 2 seconds
    - On clipboard failure: switch to selectable `<textarea>` with manual copy instruction
    - Hidden entirely when `urgency === 'emergency'`
    - _Requirements: 9.6, 9.7, 6.5_
  - [ ]* 16.8 Write unit test for `JobBrief`
    - Test clipboard success path: "Copied!" indicator appears and persists for ≥ 2 s
    - Test clipboard failure path: `<textarea>` fallback renders with copy instruction
    - Test hidden when `urgency === 'emergency'`
    - _Requirements: 9.6, 9.7, 6.5_
  - [ ] 16.9 Create `src/components/results/IssueSummary.tsx`
    - Display `likelyIssue`, `trade`, two `followUpQuestions`
    - Plain text; no urgency colour; no DIY steps shown when `diySteps` array is empty
    - _Requirements: 9.1_
  - [ ]* 16.10 Write property test for emergency field suppression (Property 13)
    - **Property 13: Emergency results never contain cost range, job brief, or DIY steps**
    - **Validates: Requirements 6.5**
    - Generate `InspectionResult` with `urgency === 'emergency'` using `fast-check`; render the Results Page components; verify cost range, job brief, and DIY steps are absent from the rendered output
    - Tag: `// Feature: intake-and-triage, Property 13: Emergency results never contain cost range, job brief, or DIY steps`

- [ ] 17. Pages
  - [ ] 17.1 Create root layout `src/app/layout.tsx`
    - Import global Tailwind styles; set up font and global providers (Amplify Auth context)
    - _Requirements: all (foundational)_
  - [ ] 17.2 Create home page `src/app/page.tsx`
    - Prominent upload CTA: "Upload a photo or video of your problem"
    - Compose `DropZone`, `ContextForm`, `DataRetentionNotice`, `UploadProgress` using `useUpload` hook
    - Submit button disabled until `DataRetentionNotice` has been visible AND location answer is non-empty
    - If user attempts submit before notice is visible: scroll notice into view and show inline prompt
    - Loading state: display "Inspecting your home…" while `uploadStatus === 'analysing'`
    - Error state: display error message with "Try again" action restoring previously selected files
    - _Requirements: 2.3–2.5, 5.1–5.5, 10.1–10.4_
  - [ ] 17.3 Create results page `src/app/inspect/[id]/page.tsx`
    - Use `useInspection(id)` hook to fetch result
    - Compose `EmergencyBanner`, `UrgencyBadge`, `IssueSummary`, `CostRange`, `JobBrief`
    - Display confidence as `formatConfidence(result.confidence)` labelled "AI confidence in this diagnosis"
    - For guest users: show persistent notice "Your result is not saved and will be lost when you navigate away"
    - On deserialisation failure: render error message only (no partial display)
    - _Requirements: 9.1–9.7, 11.3, 13.4_

- [ ] 18. InspectionResult serialisation round-trip
  - [ ] 18.1 Create `src/lib/validation/inspectionSchema.ts` — add and export `inspectionResultSchema` (full Zod schema for `InspectionResult`)
    - Used for deserialisation validation in `useInspection` hook
    - _Requirements: 13.1, 13.2, 13.4_
  - [ ]* 18.2 Write property test for round-trip serialisation (Property 18)
    - **Property 18: InspectionResult serialisation round-trip**
    - **Validates: Requirements 13.3**
    - Generate valid `InspectionResult` objects with `fast-check`; `JSON.parse(JSON.stringify(x))` then `inspectionResultSchema.parse`; verify every field value and type is identical to original
    - Tag: `// Feature: intake-and-triage, Property 18: InspectionResult serialisation round-trip`
  - [ ]* 18.3 Write property test for guest no-persist (Property 17)
    - **Property 17: Guest inspections are never persisted**
    - **Validates: Requirements 11.2**
    - Spy on `persistInspection`; generate `InspectionSubmission` with guest session using `fast-check`; verify `persistInspection` is never called
    - Tag: `// Feature: intake-and-triage, Property 17: Guest inspections are never persisted`

- [ ] 19. Final checkpoint — All tests pass
  - Ensure all property-based tests, unit tests, and integration tests pass. Run `next lint` and `tsc --noEmit`. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The Safety Layer (tasks 5.x) must be implemented and verified before the `POST /api/inspect` route handler (task 11.x)
- The `server-only` package must be imported at the top of every file in `src/lib/aws/` and `src/lib/safety/` to prevent accidental client-side imports
- Property tests use `fast-check`; unit tests use Jest + React Testing Library; integration tests use Vitest + MSW
- Tag format for each property test: `// Feature: intake-and-triage, Property {N}: {property title}`
- DynamoDB write failures in `POST /api/inspect` are non-fatal — return the result to the client and log the error
- Guest user S3 keys follow the pattern `guest/{sessionId}/{inspectionId}/{filename}`; the lifecycle rule handles deletion without DynamoDB involvement
- All costs labelled "rough range, not a quote"; all confidence values prefixed with `~`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "4.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["3.3", "3.4", "4.4", "4.5", "5.1", "7.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "5.5", "7.2", "8.1", "8.2", "8.3", "9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4", "10.1", "11.1"] },
    { "id": 5, "tasks": ["10.2", "11.2", "11.3", "11.4", "11.5", "11.6", "13.1", "14.1", "14.2", "18.1"] },
    { "id": 6, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10", "13.11", "13.12", "16.1", "16.3", "16.5", "16.7", "16.9"] },
    { "id": 7, "tasks": ["16.2", "16.4", "16.6", "16.8", "16.10", "17.1"] },
    { "id": 8, "tasks": ["17.2", "17.3", "18.2", "18.3"] }
  ]
}
```
