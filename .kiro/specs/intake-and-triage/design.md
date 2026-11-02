# Design Document — Intake and Triage

## Overview

The intake-and-triage feature is the end-to-end core flow of Haunted House Inspector. A homeowner uploads up to 5 photos or one short video (≤60 s) of a home problem, answers three context questions, and receives an AI-powered structured diagnosis. Video files are never sent to the server — a client-side Frame Extractor pulls 3–5 still frames using browser-native APIs before upload. A server-side Safety Layer applies deterministic, code-driven overrides for four life-threatening emergency conditions, unconditionally superseding any AI output. The results page displays all diagnosis fields with urgency badges, tilde-prefixed confidence, and a clipboard-ready job brief.

The feature spans four concerns:

1. **Client-side intake** — DropZone, video frame extraction, context form, data retention gate.
2. **Upload pipeline** — pre-signed S3 PUT URL flow.
3. **Server-side analysis** — Inspect API orchestrating Bedrock → Safety Layer → DynamoDB.
4. **Results display** — Results page with conditional emergency override rendering.

---

## Architecture

### High-Level Data Flow

```
Browser (Client Components)
  │
  ├─ DropZone  ─────────────────────────────────────┐
  │   ├─ validates type / count / size / duration   │  File blobs
  │   └─ Frame_Extractor (HTMLVideoElement+Canvas)  │  (image frames only)
  │                                                  ▼
  │   GET /api/upload-url?filename=&contentType=    S3 pre-signed PUT URL
  │   ◄────────────────────────────────────────────┘
  │   PUT (direct to S3 via pre-signed URL)
  │
  ├─ ContextForm
  │   └─ three text answers (location required, how long?, recent changes?)
  │
  ├─ useUpload hook  ──── orchestrates DropZone + form + submit
  │
  └─ POST /api/inspect  { s3Keys[], answers }
       │
       ├─ Safety Layer (pre-check on context answers)
       │
       ├─ Bedrock_Client  ──── Claude vision model
       │   └─ structured JSON response
       │
       ├─ Zod validation of Bedrock response
       │
       ├─ Safety Layer (post-check on Bedrock output + merge with pre-check)
       │
       ├─ DynamoDB persistence (authenticated users only)
       │
       └─ InspectionResult  ──── returned to browser
            │
            └─ /inspect/[id]  Results_Page
```

### Module Boundaries

| Layer | Location | Constraint |
|---|---|---|
| Client Components | `src/components/upload/`, `src/components/results/` | No AWS SDK imports; communicate via Route Handlers only |
| Custom hooks | `src/hooks/useUpload.ts`, `src/hooks/useInspection.ts` | Client-side only; orchestrate API calls and local state |
| Route Handlers | `src/app/api/upload-url/route.ts`, `src/app/api/inspect/route.ts` | Server-side only; guarded with `server-only` package |
| AWS singletons | `src/lib/aws/bedrock.ts`, `src/lib/aws/s3.ts`, `src/lib/aws/dynamodb.ts` | Server-side only; instantiated once per cold start |
| Safety Layer | `src/lib/safety/safetyLayer.ts` | Pure function module; no I/O; no Bedrock dependency |
| Prompts | `src/lib/prompts/inspectPrompt.ts` | Pure template functions; testable independently |
| Validation schemas | `src/lib/validation/uploadSchema.ts`, `src/lib/validation/inspectionSchema.ts` | Shared Zod schemas; importable from both client and server |

---

## Components and Interfaces

### `DropZone` (`src/components/upload/DropZone.tsx`)

Accepts drag-and-drop events and file-picker input. Enforces all upload constraints synchronously before the user can proceed.

```typescript
interface DropZoneProps {
  onFilesAccepted: (files: AcceptedFiles) => void;
  onValidationError: (errors: UploadValidationError[]) => void;
}

type AcceptedFiles =
  | { kind: 'images'; files: File[] }     // 1–5 JPEG/PNG/WebP
  | { kind: 'frames'; files: File[] };    // 1–5 extracted JPEG frames (from video)

interface UploadValidationError {
  code: UploadErrorCode;
  message: string;
  affectedFiles?: string[];
}

type UploadErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_MANY_IMAGES'
  | 'MIXED_MEDIA'
  | 'VIDEO_TOO_LONG'
  | 'TOO_MANY_VIDEOS'
  | 'FILE_TOO_LARGE'
  | 'EXTRACTION_FAILED'
  | 'EXTRACTION_TIMEOUT';
```

Validation order (all checked before extraction begins):
1. Unsupported MIME type → reject with `UNSUPPORTED_TYPE`
2. Mixed images + video → reject with `MIXED_MEDIA`
3. Multiple videos → reject with `TOO_MANY_VIDEOS`
4. Image count > 5 → reject with `TOO_MANY_IMAGES`
5. File size exceeded → reject with `FILE_TOO_LARGE`
6. Video duration > 60 s → reject with `VIDEO_TOO_LONG` (checked after loading metadata)

File-size thresholds: images ≤ 20 MB, video ≤ 500 MB.

---

### `FrameExtractor` (`src/lib/frameExtractor.ts`)

A pure async function (not a React component) invoked by `DropZone` when a valid video file is selected. Uses browser-native `HTMLVideoElement` and `CanvasRenderingContext2D` — no third-party library.

```typescript
interface FrameExtractionResult {
  frames: Blob[];       // 3–5 JPEG blobs
  timestamps: number[]; // seconds, parallel array
}

interface FrameExtractionError {
  code: 'TIMEOUT' | 'UNSUPPORTED' | 'PROCESSING_ERROR';
  message: string;
}

async function extractFrames(
  videoFile: File
): Promise<FrameExtractionResult | FrameExtractionError>;
```

Algorithm:
1. Create an `<video>` element (off-screen), set `src = URL.createObjectURL(videoFile)`, load metadata.
2. Determine frame timestamps:
   - If `duration < 3 s`: timestamps = [1, 2, …, floor(duration)] (whole-second frames; at least 1).
   - Otherwise: 3–5 evenly spaced timestamps across [0, duration].
3. For each timestamp: seek via `currentTime`, wait for `seeked` event, draw to `<canvas>` (scale so shorter side ≥ 640 px), call `canvas.toBlob('image/jpeg', 0.82)`.
4. Wrap the whole operation in a 15-second `AbortController` / `Promise.race` timeout.
5. Clean up object URL via `URL.revokeObjectURL`.

---

### `UploadProgress` (`src/components/upload/UploadProgress.tsx`)

Displays per-file upload progress and overall status. Receives progress updates from the `useUpload` hook.

```typescript
interface UploadProgressProps {
  files: Array<{ name: string; progress: number; status: 'pending' | 'uploading' | 'done' | 'error' }>;
}
```

---

### `ContextForm` (`src/components/upload/ContextForm.tsx`)

Renders the three context questions. Question (a) is required; (b) and (c) are optional.

```typescript
interface ContextFormProps {
  value: ContextAnswers;
  onChange: (answers: ContextAnswers) => void;
  onValidationChange: (valid: boolean) => void;
}

interface ContextAnswers {
  location: string;      // question (a) — required, max 500 chars
  duration: string;      // question (b) — optional, max 500 chars
  recentChanges: string; // question (c) — optional, max 500 chars
}
```

Each field shows a real-time character counter (`{n}/500`). Input beyond 500 characters is blocked. Location field shows an inline error if the submitted value is empty or whitespace-only.

---

### `DataRetentionNotice` (`src/components/upload/DataRetentionNotice.tsx`)

Renders the plain-language data retention notice. Emits an `onVisible` callback (via `IntersectionObserver`) when the element enters the viewport for the first time. The parent page uses this to toggle the submit button's disabled state.

```typescript
interface DataRetentionNoticeProps {
  onVisible: () => void;
}
```

Intersection Observer options: `threshold: 0.9` (90 % of the element must be visible before the callback fires, ensuring the user has actually seen the full notice).

---

### `useUpload` hook (`src/hooks/useUpload.ts`)

Orchestrates the full client-side upload flow. Client Component code calls this; the hook encapsulates all AWS interaction via Route Handlers.

```typescript
interface UseUploadReturn {
  // State
  files: AcceptedFiles | null;
  answers: ContextAnswers;
  noticeVisible: boolean;
  uploadStatus: 'idle' | 'uploading' | 'analysing' | 'done' | 'error';
  uploadError: string | null;
  inspectionId: string | null;

  // Actions
  setFiles: (files: AcceptedFiles) => void;
  setAnswers: (answers: ContextAnswers) => void;
  markNoticeVisible: () => void;
  submit: () => Promise<void>;
  reset: () => void;
}
```

`submit()` flow:
1. Validate answers (location non-empty).
2. For each file: `GET /api/upload-url` → PUT to pre-signed URL → collect S3 key.
3. `POST /api/inspect` with `{ s3Keys, answers }`.
4. On success: navigate to `/inspect/[id]`.
5. On timeout (60 s): abort, set error state.

---

### `useInspection` hook (`src/hooks/useInspection.ts`)

Fetches and caches an inspection result for the Results Page.

```typescript
interface UseInspectionReturn {
  result: InspectionResult | null;
  loading: boolean;
  error: string | null;
}

function useInspection(id: string): UseInspectionReturn;
```

For guest users, `id` is a temporary in-memory key; the hook reads from a session-local state store rather than a persisted API call.

---

### Results Page Components

#### `IssueSummary` (`src/components/results/IssueSummary.tsx`)
Displays `likelyIssue`, `trade`, two follow-up questions. Plain text, no urgency colour.

#### `UrgencyBadge` (`src/components/results/UrgencyBadge.tsx`)

```typescript
interface UrgencyBadgeProps {
  urgency: UrgencyLevel;
}
// Renders: 'emergency' → "Emergency" (red), 'urgent' → "Urgent — act today" (orange),
//          'soon' → "Soon — within a week" (yellow), 'monitor' → "Monitor — keep an eye on it" (green)
```

#### `CostRange` (`src/components/results/CostRange.tsx`)
Renders `costRangeLow`–`costRangeHigh` formatted as local currency, with the mandatory label "rough range, not a quote" beneath. Hidden entirely when `urgency === 'emergency'`.

#### `JobBrief` (`src/components/results/JobBrief.tsx`)
Renders `jobBrief` text with a one-click "Copy" button. On success, shows "Copied!" for 2 seconds. On clipboard failure, switches to a selectable `<textarea>` with an instruction to copy manually. Hidden entirely when `urgency === 'emergency'`.

#### `EmergencyBanner` (`src/components/results/EmergencyBanner.tsx`)
Conditionally rendered when `urgency === 'emergency'`. Displays exactly:

> "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside."

---

## Data Models

### `InspectionResult` (`src/types/inspection.ts`)

```typescript
export type UrgencyLevel = 'emergency' | 'urgent' | 'soon' | 'monitor';

export interface InspectionResult {
  id: string;                    // UUID, generated server-side
  userId: string | 'guest';
  createdAt: string;             // ISO 8601 UTC
  s3Keys: string[];              // keys of uploaded frames/images

  // Bedrock output (after Safety Layer merge)
  likelyIssue: string;           // max 500 chars
  trade: string;                 // max 100 chars
  urgency: UrgencyLevel;
  confidence: number;            // 0–1 inclusive
  costRangeLow: number;          // 0–999999; absent when urgency=emergency
  costRangeHigh: number;         // 0–999999; absent when urgency=emergency
  jobBrief: string;              // max 1000 chars; absent when urgency=emergency
  followUpQuestions: [string, string]; // exactly 2, max 200 chars each
  diySteps: string[];            // empty array for electrician/gas engineer trades or emergency
  isEmergency: boolean;

  // Context answers
  answers: ContextAnswers;
}
```

### `BedrockInspectionResponse` (`src/types/bedrock.ts`)

Raw JSON structure requested from and returned by Claude. Validated with Zod before use.

```typescript
export interface BedrockInspectionResponse {
  likelyIssue: string;
  trade: string;
  urgency: 'urgent' | 'soon' | 'monitor'; // Bedrock never returns 'emergency'
  confidence: number;
  costRangeLow: number;
  costRangeHigh: number;
  jobBrief: string;
  followUpQuestions: [string, string];
  diySteps: string[];
}
```

### Zod Schemas (`src/lib/validation/inspectionSchema.ts`)

```typescript
export const bedrockResponseSchema = z.object({
  likelyIssue: z.string().max(500),
  trade: z.string().max(100),
  urgency: z.enum(['urgent', 'soon', 'monitor']),
  confidence: z.number().min(0).max(1),
  costRangeLow: z.number().min(0).max(999999),
  costRangeHigh: z.number().min(0).max(999999),
  jobBrief: z.string().max(1000),
  followUpQuestions: z.tuple([
    z.string().max(200),
    z.string().max(200),
  ]),
  diySteps: z.array(z.string()),
}).refine(d => d.costRangeHigh >= d.costRangeLow, {
  message: 'costRangeHigh must be >= costRangeLow',
});

export const contextAnswersSchema = z.object({
  location: z.string().min(1, 'Location is required').max(500),
  duration: z.string().max(500).optional().default(''),
  recentChanges: z.string().max(500).optional().default(''),
});

export const inspectRequestSchema = z.object({
  s3Keys: z.array(z.string().min(1)).min(1).max(5),
  answers: contextAnswersSchema,
});
```

### DynamoDB Single-Table Design (`src/lib/aws/dynamodb.ts`)

Table name: `process.env.DYNAMODB_TABLE_NAME`

| Attribute | Type | Notes |
|---|---|---|
| `PK` | String | `USER#{userId}` |
| `SK` | String | `INSPECTION#{createdAt}#{id}` |
| `id` | String | UUID |
| `userId` | String | Cognito `sub`; `'guest'` not stored |
| `createdAt` | String | ISO 8601 UTC |
| `s3Keys` | List | Array of S3 object keys |
| `result` | Map | Full `InspectionResult` JSON blob |
| `ttl` | Number | Unix epoch; `createdAt + 30 days` — aligns with S3 lifecycle |

Access patterns:
- Get single inspection: `PK = USER#{userId}`, `SK = INSPECTION#{id}`
- List user inspections: `PK = USER#{userId}`, `SK begins_with INSPECTION#` (sorted by date descending via GSI or scan + sort)

### S3 Object Keys

Pattern: `{userId}/{inspectionId}/{filename}`

For guest users: `guest/{sessionId}/{inspectionId}/{filename}` (still stored; lifecycle rule handles deletion; just not referenced in DynamoDB).

S3 Lifecycle Rule: expire all objects at prefix `/` after 30 days (configured via CDK / Amplify custom resource or console — outside app code scope, but required by Requirement 12).

---

## Route Handlers

### `GET /api/upload-url` (`src/app/api/upload-url/route.ts`)

Returns a pre-signed S3 PUT URL.

**Request query params:**
- `filename` (string, required)
- `contentType` (string, required — must be one of the accepted MIME types)
- `inspectionId` (string, required — UUID generated client-side)

**Response:**
```json
{ "url": "https://s3.amazonaws.com/...", "key": "userId/inspectionId/filename" }
```

Server-side steps:
1. Validate query params with Zod (reject unknown MIME types).
2. Resolve `userId` from Amplify Auth session (fall back to `guest/{sessionId}`).
3. Build S3 key: `{userId}/{inspectionId}/{sanitised filename}`.
4. Call `PutObjectCommand` via `getSignedUrl` with `expiresIn: 900` (15 minutes).
5. Return `{ url, key }`.

---

### `POST /api/inspect` (`src/app/api/inspect/route.ts`)

Orchestrates the full analysis pipeline.

**Request body:**
```json
{ "s3Keys": ["userId/inspId/frame-1.jpg", ...], "answers": { "location": "...", "duration": "...", "recentChanges": "..." } }
```

**Orchestration steps:**
1. Parse + Zod-validate request body.
2. **Safety Layer pre-check**: run emergency detection on all three context answer strings. If triggered → skip Bedrock, return emergency result immediately.
3. Invoke `Bedrock_Client` with S3 keys + answers; enforce 30-second timeout.
4. Zod-validate Bedrock response; on failure → return HTTP 502.
5. **Safety Layer post-check**: run emergency detection on Bedrock output text (`likelyIssue`, `jobBrief`). Merge with pre-check result.
6. Apply Safety Layer overrides (urgency, DIY suppression, field suppression).
7. Assemble `InspectionResult` (generate UUID, timestamp).
8. If authenticated: persist to DynamoDB.
9. Return `InspectionResult` JSON.

**Error responses:**
- `400` — invalid request body.
- `502` — Bedrock validation failure or service error.
- `504` — Bedrock timeout (> 30 s).

---

## Safety Layer Design (`src/lib/safety/safetyLayer.ts`)

The Safety Layer is a pure TypeScript module with no I/O, no Bedrock dependency, and no async code. It exports two functions: one for emergency detection and one for applying overrides.

```typescript
export interface SafetyCheckInput {
  contextAnswers: ContextAnswers;
  bedrockOutput?: string; // concatenated likelyIssue + jobBrief
}

export interface SafetyCheckResult {
  isEmergency: boolean;
  triggeredCondition?: EmergencyConditionCode;
}

export type EmergencyConditionCode =
  | 'GAS_SMELL'
  | 'ELECTRICAL_FIRE'
  | 'WATER_ELECTRICAL'
  | 'CO_ALARM';

export function checkEmergency(input: SafetyCheckInput): SafetyCheckResult;

export function applyOverrides(
  bedrockResult: BedrockInspectionResponse,
  safetyResult: SafetyCheckResult,
  trade: string
): InspectionResult;
```

### Emergency Trigger Matching Rules

All matching is **case-insensitive substring** search. "Proximity" is defined as both terms appearing within the same 200-character window of the evaluated string.

| Code | Triggers when… |
|---|---|
| `GAS_SMELL` | Input contains `'gas smell'` OR `'rotten egg'` |
| `ELECTRICAL_FIRE` | Input contains (`'sparks'` OR `'burning smell'` OR `'scorch marks'`) AND (within 200 chars) (`'outlet'` OR `'panel'` OR `'appliance'`) |
| `WATER_ELECTRICAL` | Input contains `'water'` AND (`'flood'` OR `'flooding'`) AND (within 200 chars) (`'electrical outlet'` OR `'panel'` OR `'appliance'`) |
| `CO_ALARM` | Input contains `'carbon monoxide alarm'` |

### Override Rules (applied in `applyOverrides`)

1. If `isEmergency`:
   - Set `urgency = 'emergency'`, `isEmergency = true`.
   - Set `costRangeLow = 0`, `costRangeHigh = 0` (field suppressed in UI, not null to satisfy schema).
   - Set `jobBrief = ''` (suppressed in UI).
   - Set `diySteps = []`.
2. If `trade` (normalised, lowercase) is `'electrician'` or `'gas engineer'`:
   - Set `diySteps = []`.
3. These rules are applied regardless of Bedrock output.

---

## Bedrock Client (`src/lib/aws/bedrock.ts`)

Uses AWS SDK v3 `@aws-sdk/client-bedrock-runtime` with `InvokeModelCommand` (for Claude's messages API via `anthropic.claude-3-sonnet-20240229-v1:0` or the value of `BEDROCK_MODEL_ID`).

```typescript
export async function invokeInspectionModel(
  s3Keys: string[],
  answers: ContextAnswers
): Promise<BedrockInspectionResponse>;
```

The function:
1. Fetches pre-signed GET URLs for each S3 key (for passing image bytes to Bedrock's vision API).
2. Builds the prompt via `buildInspectPrompt(answers)` from `src/lib/prompts/inspectPrompt.ts`.
3. Constructs the Bedrock `messages` payload with image content blocks (base64-encoded JPEG) and the text prompt.
4. Calls `InvokeModelCommand` with a 30-second timeout signal.
5. Decodes the response body, extracts the JSON string from Claude's reply.
6. Returns the raw parsed object (Zod validation is the caller's responsibility).

### Prompt Template (`src/lib/prompts/inspectPrompt.ts`)

```typescript
export interface InspectPromptContext {
  location: string;
  duration: string;
  recentChanges: string;
  imageCount: number;
}

export function buildInspectPrompt(ctx: InspectPromptContext): string;
```

The prompt instructs Claude to:
- Analyse the attached images for visible home defects.
- Use the context answers to narrow the diagnosis.
- Return a JSON object matching the `BedrockInspectionResponse` schema exactly.
- Never return `urgency: 'emergency'` (that is the Safety Layer's job).
- Use non-technical language suitable for a non-trade homeowner.
- Label cost ranges as estimates and express confidence as a decimal 0–1.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File type validation rejects exactly the non-allowed MIME types

*For any* file with a MIME type that is not one of `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, or `video/webm`, the upload validator SHALL return an invalid result; and for any file with one of those five MIME types, the validator SHALL return valid.

**Validates: Requirements 1.1**

---

### Property 2: Mixed-media submissions are always rejected

*For any* file list containing at least one image file and at least one video file simultaneously, the upload validator SHALL return an invalid result regardless of individual file validity.

**Validates: Requirements 1.3**

---

### Property 3: Image count constraint

*For any* list of valid image files with length n, the upload validator SHALL accept the submission only when n is between 1 and 5 inclusive, and SHALL reject when n > 5.

**Validates: Requirements 1.2**

---

### Property 4: Video duration constraint

*For any* numeric duration value d, the video duration validator SHALL accept d when d ≤ 60 and reject d when d > 60.

**Validates: Requirements 1.4**

---

### Property 5: File size constraint

*For any* image file with size s, the file size validator SHALL reject it when s > 20 971 520 bytes (20 MB); and for any video file with size s, SHALL reject when s > 524 288 000 bytes (500 MB).

**Validates: Requirements 1.8**

---

### Property 6: Frame count for standard-length videos

*For any* video file with duration ≥ 3 seconds, the Frame Extractor SHALL return between 3 and 5 frames, and the frame timestamps SHALL be evenly distributed across the video duration.

**Validates: Requirements 3.1**

---

### Property 7: Frame count for short videos

*For any* video file with duration d where 0 < d < 3 seconds, the Frame Extractor SHALL return exactly floor(d) frames (each at a whole-second timestamp), provided floor(d) ≥ 1.

**Validates: Requirements 3.6**

---

### Property 8: Whitespace-only location answer is invalid

*For any* string composed entirely of whitespace characters (spaces, tabs, newlines), the context form validator SHALL treat the location field as empty and return an invalid result.

**Validates: Requirements 5.2**

---

### Property 9: All three context answers are always included in the submission payload

*For any* combination of location, duration, and recentChanges answer values (including empty optional fields), the submitted payload to the Inspect API SHALL contain all three fields with their original values.

**Validates: Requirements 5.4**

---

### Property 10: Character count limit enforcement

*For any* input string with length > 500 characters, the context form SHALL accept only the first 500 characters and the character counter SHALL display 500/500.

**Validates: Requirements 5.5**

---

### Property 11: Emergency detection on any trigger-containing text

*For any* text string that contains a trigger phrase (case-insensitive substring match per the Safety Layer rules), `checkEmergency` SHALL return `isEmergency: true`; and for any text that contains none of the trigger phrases, `checkEmergency` SHALL return `isEmergency: false`.

**Validates: Requirements 6.1, 6.2**

---

### Property 12: Emergency urgency override is unconditional

*For any* `BedrockInspectionResponse` where the context answers or Bedrock output text contain an emergency trigger, `applyOverrides` SHALL always set `urgency` to `'emergency'` regardless of the value in the Bedrock response.

**Validates: Requirements 6.3, 6.7**

---

### Property 13: Emergency results never contain cost range, job brief, or DIY steps

*For any* `InspectionResult` with `urgency === 'emergency'`, the rendered Results Page SHALL contain no cost range, job brief, or DIY step content.

**Validates: Requirements 6.5**

---

### Property 14: DIY steps suppressed for dangerous trades

*For any* `BedrockInspectionResponse` where `trade` (normalised to lowercase) is `'electrician'` or `'gas engineer'`, `applyOverrides` SHALL return a result with an empty `diySteps` array, regardless of what Bedrock returned in that field.

**Validates: Requirements 7.1**

---

### Property 15: Urgency label mapping is exhaustive and exact

*For any* `UrgencyLevel` value in `{ 'emergency', 'urgent', 'soon', 'monitor' }`, the `urgencyLabel` utility SHALL return the exact specified string, and the mapping SHALL be a total function (no value produces undefined or an empty string).

**Validates: Requirements 9.2**

---

### Property 16: Confidence formatting always produces a tilde-prefixed percentage

*For any* confidence value c in [0, 1], `formatConfidence(c)` SHALL return a string that starts with `~`, ends with `%`, and whose numeric portion is `Math.round(c * 100)` as a decimal integer.

**Validates: Requirements 9.3, 9.5**

---

### Property 17: Guest inspections are never persisted

*For any* inspection submission made in guest mode (unauthenticated), the `persist` function of `DynamoDB_Store` SHALL never be called.

**Validates: Requirements 11.2**

---

### Property 18: InspectionResult serialisation round-trip

*For any* `InspectionResult` object that passes `bedrockResponseSchema` (merged with the full result schema) validation, serialising to JSON via `JSON.stringify` and then deserialising via `JSON.parse` followed by Zod `inspectionResultSchema.parse` SHALL produce an object in which every field value and type is identical to the original.

**Validates: Requirements 13.3**

---

### Property 19: Zod schema correctly classifies Bedrock responses

*For any* JSON object, `bedrockResponseSchema.safeParse` SHALL return `{ success: true }` if and only if the object satisfies all field type, range, and length constraints defined in the schema; otherwise it SHALL return `{ success: false }`.

**Validates: Requirements 8.3, 8.4**

---

## Error Handling

### Client-Side Errors

| Scenario | Behaviour |
|---|---|
| File validation failure | Inline error message in DropZone; user can deselect and retry |
| Video frame extraction timeout (15 s) | Error message; offer Retry or Switch to photos |
| Frame extraction processing error | Same as timeout + same two options |
| `GET /api/upload-url` failure | Block submission; show "Upload cannot proceed" error |
| S3 PUT failure | Show per-file error; offer Retry for that file |
| `POST /api/inspect` 502 (Bedrock) | "Analysis failed – please try again"; Try Again returns user to upload with files still populated |
| `POST /api/inspect` 504 (timeout) | "Inspection timed out – please try again"; same recovery |
| 60-second client-side timeout | Abort fetch; same error copy and recovery as 504 |
| Clipboard write failure | Show selectable `<textarea>` fallback for manual copy |
| Stored result deserialisation failure | "This result could not be loaded" error page; no partial display |

### Server-Side Errors

| Scenario | HTTP Status | Response |
|---|---|---|
| Invalid request body | 400 | Zod error details |
| S3 pre-sign failure | 500 | Generic "Upload service unavailable" |
| Bedrock service error | 502 | "Analysis temporarily unavailable" |
| Bedrock timeout (> 30 s) | 504 | "Analysis timed out" |
| Bedrock response fails Zod validation | 502 | "Analysis returned unexpected data" |
| DynamoDB write failure | 207 (partial success) | Return result to client; log DynamoDB error; result is not persisted |

DynamoDB write failures are non-fatal: the client receives the analysis result even if persistence fails, and the error is logged for operator visibility.

---

## Testing Strategy

### Unit Tests

Focus on pure functions and component rendering. Use **Jest** + **React Testing Library**.

Key unit test targets:
- `validateFiles()` — all rejection conditions (type, count, size, duration, mixed media).
- `extractFrames()` — mock `HTMLVideoElement`; test frame count for standard/short/boundary durations.
- `checkEmergency()` — all four trigger conditions, case variations, proximity rules, non-trigger inputs.
- `applyOverrides()` — emergency override, DIY suppression by trade, normal passthrough.
- `buildInspectPrompt()` — snapshot test of rendered prompt given known context.
- `bedrockResponseSchema` — valid/invalid JSON objects.
- `contextAnswersSchema` — whitespace, empty, length boundary.
- `urgencyLabel()` — all four values.
- `formatConfidence()` — boundary values (0, 0.5, 1.0) and mid-range values.
- `UrgencyBadge`, `CostRange`, `JobBrief`, `EmergencyBanner` — rendering with emergency vs. non-emergency props.
- `DataRetentionNotice` — mock `IntersectionObserver`; verify `onVisible` fires on first intersection only.

### Property-Based Tests

Use **fast-check** for property-based testing. Each test runs a minimum of 100 iterations.

| Property | Generator strategy |
|---|---|
| P1 — File type validation | `fc.string()` for MIME type; `fc.constantFrom(allowed types)` for valid paths |
| P2 — Mixed-media rejection | `fc.array(imageFile)` min 1, `fc.array(videoFile)` min 1, concatenated |
| P3 — Image count | `fc.array(imageFile, { minLength: 1, maxLength: 20 })` |
| P4 — Video duration | `fc.float({ min: 0, max: 120 })` |
| P5 — File size | `fc.integer({ min: 0, max: 600_000_000 })` |
| P6 — Frame count standard | `fc.float({ min: 3, max: 60 })` for duration |
| P7 — Frame count short | `fc.float({ min: 0.001, max: 2.999 })` for duration |
| P8 — Whitespace location | `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` |
| P9 — Context answer payload | `fc.record({ location: fc.string(), duration: fc.string(), recentChanges: fc.string() })` |
| P10 — Char limit | `fc.string({ minLength: 501, maxLength: 2000 })` |
| P11 — Emergency detection | `fc.string()` + inject trigger phrase at random position; `fc.string()` without trigger |
| P12 — Emergency override | `fc.record(BedrockResponseArb)` with emergency context; verify urgency |
| P13 — Emergency field suppression | `InspectionResultArb` with urgency=emergency; render; verify absent fields |
| P14 — DIY suppression | `fc.constantFrom('electrician', 'gas engineer')` as trade; arbitrary diySteps array |
| P15 — Urgency label | `fc.constantFrom('emergency', 'urgent', 'soon', 'monitor')` |
| P16 — Confidence formatting | `fc.float({ min: 0, max: 1 })` |
| P17 — Guest no-persist | `InspectionSubmissionArb` with guest session; spy on DynamoDB.persist |
| P18 — Round-trip serialisation | `ValidInspectionResultArb`; `JSON.parse(JSON.stringify(x))` then schema parse |
| P19 — Zod schema classification | `fc.object()` (arbitrary JSON); compare schema.safeParse with expected validity |

Tag format for each property test: `// Feature: intake-and-triage, Property {N}: {property title}`

### Integration Tests

Use **Vitest** + **MSW** (Mock Service Worker) to intercept Route Handler calls in a Node environment.

Integration test scenarios:
- Full upload + inspect happy path (mock S3 pre-sign, mock Bedrock, verify DynamoDB called for auth user).
- Emergency trigger in context answers: verify response has urgency=emergency and suppressed fields, Bedrock never called.
- Emergency trigger in Bedrock output: verify override applied post-Bedrock.
- Bedrock Zod validation failure: verify 502 response.
- Bedrock timeout: verify 504 response.
- Guest user flow: verify DynamoDB.persist never called.
- Stored result deserialisation failure: verify error page rendered.

### Smoke Tests

- S3 bucket lifecycle rule exists and specifies 30-day expiry (single infrastructure check, not run in CI unit test suite).
