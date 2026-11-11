# Design Document — Intake and Triage

## Overview

The intake-and-triage feature is the end-to-end core flow of Haunted House Inspector. A homeowner uploads up to 5 photos or one short video (≤30 s) of a home problem, answers three context questions, and receives an AI-powered structured diagnosis. Video files are never sent to the server — a client-side Frame Extractor pulls 3–5 still frames using browser-native APIs before upload. A server-side Safety Layer **always** evaluates the homeowner's context answers for emergency trigger conditions on every request — even when the Bedrock call fails or times out. It additionally evaluates Bedrock output when the call succeeds. An emergency detected in the context answers is returned immediately; a Bedrock failure with no safety trigger returns a friendly retry message. Every job is identified by a random, unguessable UUID; the job link `/inspect/[id]` is the only access mechanism — no accounts or sign-in are required. Every job is persisted server-side (no guest branching); in addition, the browser keeps a per-tab session cache (`sessionStorage`) of the visitor's own just-created result so the result, especially the emergency banner, still shows if the DynamoDB save failed (non-fatal) or the read is slow. Shared links have no cached copy and use the DynamoDB-backed GET alone. The results page displays all diagnosis fields with urgency badges, tilde-prefixed confidence, and a clipboard-ready job brief.

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
       ├─ Safety Layer (context-answer check — always runs first)
       │   └─ Emergency detected? → persist + return emergency result immediately
       │      (skips Rate Limiter and Bedrock; never blocked by or counted against the daily limit)
       │
       ├─ Rate Limiter (non-emergency only; cookie/IP — reject with 429 if ≥ 15/day)
       │
       ├─ Bedrock_Client  ──── Amazon Nova Lite vision model
       │   ├─ Success: structured JSON response
       │   └─ Failure/timeout: Safety Layer already ran; return friendly error if no trigger fired
       │
       ├─ Zod validation of Bedrock response (only on success path)
       │
       ├─ Safety Layer (post-Bedrock merge: re-evaluate with Bedrock output added)
       │
       ├─ DynamoDB persistence (every job, no auth check)
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
| Session cache helper | `src/lib/sessionResultCache.ts` | Small client-side module; `cacheResult(result)` and `readCachedResult(id)` wrap `sessionStorage`; no AWS calls; swallows storage errors |
| Route Handlers | `src/app/api/upload-url/route.ts`, `src/app/api/inspect/route.ts`, `src/app/api/inspections/[id]/route.ts` | Server-side only; guarded with `server-only` package |
| AWS singletons | `src/lib/aws/bedrock.ts`, `src/lib/aws/s3.ts`, `src/lib/aws/dynamodb.ts` | Server-side only; instantiated once per cold start |
| Safety Layer | `src/lib/safety/safetyLayer.ts` | Pure function module; no I/O; no Bedrock dependency |
| Rate Limiter | `src/lib/rateLimiter.ts` | Pure function module; reads cookie or IP; no AWS calls |
| Prompts | `src/lib/prompts/inspectPrompt.ts` | Pure template functions; testable independently |
| Validation schemas | `src/lib/validation/uploadSchema.ts`, `src/lib/validation/inspectionSchema.ts` | Shared Zod schemas; importable from both client and server |

---

## Components and Interfaces

### `DropZone` (`src/components/upload/DropZone.tsx`)

Accepts drag-and-drop events and file-picker input. Enforces all upload constraints synchronously before the user can proceed. The component supports both the Normal and Haunted Tailwind themes via the active theme class on the root element.

Photo selection is **additive across picks** (on a phone users often pick one photo at a time). `DropZone` is a **controlled component**: the current selection is owned by the parent (`useUpload`) and passed in through the `value` prop. Each pick or drop is merged into `value` with the pure function `mergeSelection` (see below) and the merged result is reported through `onFilesAccepted`.

```typescript
interface DropZoneProps {
  /** Current selection owned by the parent; null when nothing is selected. */
  value: AcceptedFiles | null;
  onFilesAccepted: (files: AcceptedFiles) => void;
  onValidationError: (errors: UploadValidationError[]) => void;
  /** Called when the User presses "Clear selection". */
  onSelectionCleared: () => void;
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

**Display (per selected photo).** For each photo in `value` the component shows the file name, a small thumbnail and a Remove button. Thumbnails use object URLs: one `URL.createObjectURL(file)` is created per file (memoised per `File`, not per render), and `URL.revokeObjectURL` is called when that photo is removed, when the selection is cleared or replaced, and when the component unmounts. Removing a photo calls `onFilesAccepted` with the remaining photos (or `onSelectionCleared` when none remain). The add control is labelled **"Add more photos"** while fewer than 5 photos are selected. A **"Clear selection"** action calls `onSelectionCleared`; it removes all selected files and leaves the context answers untouched. When a video is selected, the component shows its file name and the extracted-frame summary, with the usual Retry / Switch-to-photos actions on extraction failure.

**Validation order.** The incoming pick (the files from one drop or one file-picker action) is validated first, on its own:
1. Unsupported MIME type → reject with `UNSUPPORTED_TYPE`
2. Mixed images + video within the pick → reject with `MIXED_MEDIA`
3. Multiple videos within the pick → reject with `TOO_MANY_VIDEOS`

Then the merge rules are applied against the current selection (`mergeSelection`):
4. Media-kind conflict (current photos + incoming video, or current video + incoming photos) → reject with `MIXED_MEDIA`; the current selection is kept unchanged.
5. Photos: drop any incoming photo whose (name, size, lastModified) matches an already selected photo or an earlier photo in the same pick; append the rest after the existing selection in the order given; truncate to 5 and, when the distinct total exceeds 5, report `TOO_MANY_IMAGES` while still accepting the first 5.
6. Image file size > 10 MB → reject with `FILE_TOO_LARGE`.
7. Video duration > 30 s → reject with `VIDEO_TOO_LONG` (checked after loading metadata); a replacement video is accepted only if its duration is ≤ 30 s, otherwise the current selection is kept.
8. Incoming video while a video is selected (and the pick is otherwise valid) → the new video replaces the current one (one video per Submission).

**Decision on errors.** Any validation error other than `TOO_MANY_IMAGES` rejects the WHOLE incoming pick and keeps the current selection unchanged (no partial acceptance of the valid files in a rejected pick). `TOO_MANY_IMAGES` is the only error that still accepts files: the first 5 are kept (existing selection first, then new photos in the order given) and the error message is shown.

File-size threshold: images ≤ 10 MB (10 485 760 bytes). No file-size cap on video files.

#### `mergeSelection` (`src/lib/validation/mediaValidation.ts`)

A pure function (no DOM, no I/O) that applies the incoming-pick validation and the merge rules above. `SelectedFileInfo` (the structural stand-in for `File` used by the pure validators) gains an optional `lastModified: number` field used for duplicate detection (an absent value is treated as equal only to another absent value).

```typescript
interface SelectedFileInfo {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
}

/**
 * current: the current selection (null when nothing is selected); its kind is derived from the
 * MIME types of its files (images vs. one video).
 * incoming: the files of one pick, in the order given.
 * Returns the resulting selection, the validation errors, and whether the pick was accepted.
 * accepted is false when the pick was rejected (files === current ?? []); it is true when
 * files were merged, including the TOO_MANY_IMAGES case (first 5 kept, error reported).
 */
export function mergeSelection(
  current: SelectedFileInfo[] | null,
  incoming: SelectedFileInfo[]
): { files: SelectedFileInfo[]; errors: UploadValidationError[]; accepted: boolean };
```

`mergeSelection` is generic over the file type in the implementation so `DropZone` can pass real `File` objects and get `File` objects back. Video duration is not known to this function (it is checked asynchronously via `validateVideoDuration` after metadata loads); `DropZone` applies the replacement only after the duration check passes.

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
1. Create a `<video>` element (off-screen), set `src = URL.createObjectURL(videoFile)`, load metadata.
2. Enforce maximum duration of 30 seconds; reject with `PROCESSING_ERROR` if `duration > 30`.
3. Determine frame timestamps:
   - If `1 s ≤ duration < 3 s`: timestamps = [1, 2, …, floor(duration)] (whole-second frames; at least 1).
   - If `duration < 1 s`: timestamps = [0] (exactly one frame at 0 seconds).
   - Otherwise: 3–5 evenly spaced timestamps across [0, duration].
4. For each timestamp: seek via `currentTime`, wait for `seeked` event, draw to `<canvas>` (scale so shorter side ≥ 640 px), call `canvas.toBlob('image/jpeg', 0.82)`.
5. Wrap the whole operation in a 15-second `AbortController` / `Promise.race` timeout.
6. Clean up object URL via `URL.revokeObjectURL`.

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

- (a) `location`: "Where in your home is the problem?"
- (b) `duration`: "How long has this been going on?"
- (c) `recentChanges`: "Anything else we should know? For example smells, sounds, sparks or recent changes."

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
  /** Removes all selected files; keeps the context answers; resets upload error/progress state. */
  clearFiles: () => void;
  setAnswers: (answers: ContextAnswers) => void;
  markNoticeVisible: () => void;
  submit: () => Promise<void>;
  reset: () => void;
  /** Clears everything (files, answers and status); unchanged by the additive selection. */
  clearAll: () => void;
}
```

`clearFiles()` sets `files` to `null`, aborts any in-flight upload, and resets `uploadStatus`, `uploadError`, `errorKind`, `resetAt`, `inspectionId` and per-file progress, but keeps `answers` and `noticeVisible`. `clearAll()` is unchanged (it also clears the answers).

#### `UploadFlow` (`src/components/upload/UploadFlow.tsx`)

Composes `DropZone`, `ContextForm`, `DataRetentionNotice` and `UploadProgress` using `useUpload`. It passes `value={files}` to `DropZone` (the controlled selection), `setFiles` as `onFilesAccepted`, and `clearFiles` as `onSelectionCleared`. "Clear selection" therefore calls `clearFiles`, not an empty selection through `setFiles`, so the answers typed in `ContextForm` survive.

`submit()` flow:
1. Validate answers (location non-empty).
2. For each file: `GET /api/upload-url` → PUT to pre-signed URL → collect S3 key.
3. `POST /api/inspect` with `{ s3Keys, answers }`.
4. On success: call `cacheResult(result)` (from `src/lib/sessionResultCache.ts`), which stores the full `InspectionResult` JSON in `sessionStorage` under `hhi_result_{result.id}`, BEFORE navigating to `/inspect/[id]`. A storage failure is ignored and never blocks navigation.
5. On timeout (60 s): abort, set error state.

---

### `useInspection` hook (`src/hooks/useInspection.ts`)

Provides the inspection result for the Results Page: it reads the session cache first, then fetches from `GET /api/inspections/[id]`.

```typescript
interface UseInspectionReturn {
  result: InspectionResult | null;
  loading: boolean;
  error: string | null;
}

function useInspection(id: string): UseInspectionReturn;
```

Behaviour:
1. Call `readCachedResult(id)`. It reads `sessionStorage` key `hhi_result_{id}`, parses the JSON and validates it with `inspectionResultSchema`; a missing entry, invalid JSON, a schema-invalid entry, or a throwing `sessionStorage` all yield `null` (ignored). If a valid cached result exists, the hook returns it immediately (`result` set, `loading: false`).
2. Always issue `GET /api/inspections/[id]` (immediately when there is no cached copy, in the background when there is one). The response is validated with `inspectionResultSchema`. On success the fetched result replaces the cached copy (the hook updates `result` and refreshes the cache via `cacheResult`).
3. A GET failure, a 404, or a deserialisation failure does NOT hide a valid cached result: the hook keeps the cached `result` and does not surface `error`. With no cached result, a 404 is reported as not found and a failure or schema-invalid response sets `error` (no partial display). The not-found message therefore only shows when there is neither a cached nor a fetched result.

The session cache is a per-tab `sessionStorage` entry, cleared when the tab closes, and holds only the result of the current visitor's own inspection. Shared links (opened in a new browser or tab, or by another person) have no cached copy and use the GET alone. This is not a guest mode: there is no guest branching, and every job is still persisted server-side to DynamoDB and retrievable by UUID. The cache exists so the result, and especially the emergency banner, still shows if the DynamoDB save failed (a non-fatal error) or the read is slow.

The cache logic lives in the small helper module `src/lib/sessionResultCache.ts`:

```typescript
export const RESULT_CACHE_KEY_PREFIX = 'hhi_result_';

// Stores JSON.stringify(result) under `hhi_result_${result.id}`; swallows storage errors.
export function cacheResult(result: InspectionResult): void;

// Returns the schema-valid cached result for id, or null if missing, invalid JSON,
// schema-invalid, or sessionStorage throws.
export function readCachedResult(id: string): InspectionResult | null;
```

---

### Results Page Components

All results components support both the Normal and Haunted Tailwind themes via the active theme class applied at the layout level.

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
Renders `costRangeLow`–`costRangeHigh` in Canadian dollars (CAD) via `formatCurrency`, for example `CA$1,200 – CA$2,400`, with the mandatory label "rough range, not a quote" beneath. Hidden entirely when `urgency === 'emergency'`. There is no currency selector.

#### Currency (`src/lib/utils/formatCurrency.ts`)

All costs are Canadian dollars (CAD). The app serves Ontario homeowners and the costs reflect Ontario tradespeople. Bedrock is asked for `costRangeLow` and `costRangeHigh` in CAD, DynamoDB and `InspectionResult` store CAD numbers, and the UI displays CAD. There is no conversion.

`formatCurrency(amount: number): string` returns CAD with no decimals, for example `CA$1,200`. It uses `Intl.NumberFormat` with `style: 'currency'`, `currency: 'CAD'`, `minimumFractionDigits: 0` and `maximumFractionDigits: 0`. The `en-US` locale is used because it renders the `CA$` prefix; the `en-CA` locale renders a bare `$`. `currencyDisplay: 'narrowSymbol'` is not used.

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
  createdAt: string;             // ISO 8601 UTC
  s3Keys: string[];              // keys of uploaded frames/images

  // Bedrock output (after Safety Layer merge)
  likelyIssue: string;           // max 500 chars
  trade: string;                 // max 100 chars
  urgency: UrgencyLevel;
  confidence: number;            // 0–1 inclusive
  costRangeLow: number;          // CAD; 0–999999; absent when urgency=emergency
  costRangeHigh: number;         // CAD; 0–999999; absent when urgency=emergency
  jobBrief: string;              // max 1000 chars; absent when urgency=emergency
  followUpQuestions: [string, string]; // exactly 2, max 200 chars each
  diySteps: string[];            // empty array for electrical/gas/HVAC/furnace trades or emergency
  isEmergency: boolean;

  // Context answers
  answers: ContextAnswers;
}
```

`userId` has been removed. There are no user accounts. Each job is identified solely by its `id` UUID.

### `BedrockInspectionResponse` (`src/types/bedrock.ts`)

Raw JSON structure requested from and returned by the Amazon Nova Lite model. Validated with Zod before use.

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

// Full InspectionResult schema (used by GET /api/inspections/[id], useInspection and the session cache).
// It MUST accept emergency results: costRangeLow 0, costRangeHigh 0, jobBrief '' (empty),
// diySteps [], urgency 'emergency', isEmergency true.
export const inspectionResultSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  s3Keys: z.array(z.string()),
  likelyIssue: z.string().max(500),
  trade: z.string().max(100),
  urgency: z.enum(['emergency', 'urgent', 'soon', 'monitor']),
  confidence: z.number().min(0).max(1),
  costRangeLow: z.number().min(0).max(999999),
  costRangeHigh: z.number().min(0).max(999999),
  jobBrief: z.string().max(1000), // no min(1): emergency results use ''
  followUpQuestions: z.tuple([z.string().max(200), z.string().max(200)]),
  diySteps: z.array(z.string()),
  isEmergency: z.boolean(),
  answers: contextAnswersSchema,
}).refine(d => d.costRangeHigh >= d.costRangeLow, {
  message: 'costRangeHigh must be >= costRangeLow', // 0/0 passes
});

export const contextAnswersSchema = z.object({
  location: z.string().trim().min(1, 'Location is required').max(500),
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

Every job is persisted unconditionally — there is no authentication check and no guest/authenticated branching.

| Attribute | Type | Notes |
|---|---|---|
| `PK` | String | `JOB#{id}` |
| `SK` | String | `JOB#{id}` |
| `id` | String | UUID |
| `createdAt` | String | ISO 8601 UTC |
| `s3Keys` | List | Array of S3 object keys |
| `result` | Map | Full `InspectionResult` JSON blob |
| `ttl` | Number | Unix epoch; `createdAt + 30 days` — aligns with S3 lifecycle |

Access patterns:
- **Get single inspection**: `GetItem` with `PK = JOB#{id}`, `SK = JOB#{id}` and `ConsistentRead: true` (used by `GET /api/inspections/[id]`)
- **Write inspection**: `PutItem` with `PK = JOB#{id}`, `SK = JOB#{id}`

**Strongly consistent read.** `getInspection` sets `ConsistentRead: true` because the Results Page reads a job immediately after it is saved; an eventually consistent read could miss the just-written item and wrongly return 404.

There is no user-scoped listing access pattern; jobs are retrieved only by UUID via the job link.

### S3 Object Keys

Pattern: `{inspectionId}/{filename}`

No userId prefix. Every uploaded file (frames or images) is stored under the job UUID namespace.

S3 Lifecycle Rule: expire all objects at prefix `/` after 30 days (configured via Amplify custom resource or console — outside app code scope, but required by Requirement 12).

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
{ "url": "https://s3.amazonaws.com/...", "key": "inspectionId/filename" }
```

Server-side steps:
1. Validate query params with Zod (reject unknown MIME types).
2. Build S3 key: `{inspectionId}/{sanitised filename}`.
3. Call `PutObjectCommand` via `getSignedUrl` with `expiresIn: 900` (15 minutes), using the region from `APP_AWS_REGION`.
4. Return `{ url, key }`.

---

### `POST /api/inspect` (`src/app/api/inspect/route.ts`)

Orchestrates the full analysis pipeline.

**Request body:**
```json
{ "s3Keys": ["inspId/frame-1.jpg", ...], "answers": { "location": "...", "duration": "...", "recentChanges": "..." } }
```

**Orchestration steps:**
1. Parse + Zod-validate request body; return 400 on failure.
2. **Safety Layer — context-answer check (always runs, before the rate limit)**: call `checkEmergency({ contextAnswers, bedrockOutput: undefined })` on the three context answer fields. If emergency detected → skip steps 3–6, go directly to step 7 with `safetyResult.isEmergency = true`. The rate limiter is never called, so the request is neither blocked nor counted against the daily limit, even when the Visitor is already at or over 15. The emergency result is still persisted (step 8) and returned (step 9), so the job link works as usual.
3. **Rate Limiter (only when no emergency was detected in step 2)**: read httpOnly session cookie / IP fallback. If count ≥ 15 → return HTTP 429 with friendly message and `Retry-After` header before invoking Bedrock.
4. Invoke `Bedrock_Client` with S3 keys + answers; enforce a 20-second timeout (Amplify stops server requests at 30 seconds, so 20 seconds leaves time to return the emergency message when Bedrock is slow).
   - On timeout or service error: step 2 found no emergency (otherwise this step is never reached), so return HTTP 502 with message "We couldn't analyse your photos. Please try again."
5. Zod-validate Bedrock response; on failure → return HTTP 502 with the same retry message.
6. **Safety Layer — post-Bedrock merge (only when Bedrock succeeds)**: call `checkEmergency({ contextAnswers, bedrockOutput: likelyIssue + jobBrief })`. Either this result or the step 2 result being an emergency is sufficient (step 2 can only be non-emergency here).
7. Call `applyOverrides`; assemble `InspectionResult` (UUID, timestamp). Emergency requests from step 2 arrive here directly.
8. Persist to DynamoDB unconditionally (DynamoDB failure is non-fatal — log and continue).
9. Return `InspectionResult` JSON.

**Design decision — emergency requests bypass the rate limiter entirely.** A life-safety message must never be blocked by a usage limit. Emergency requests are therefore neither blocked nor counted against the daily limit (the limiter is not invoked, so `incrementRateLimitCounter` is not called), while the emergency `InspectionResult` is still persisted to DynamoDB and the job link works as usual. Because emergency context answers short-circuit before Bedrock, the Bedrock-failure emergency path (Requirement 6.9) is satisfied by the same early return.

**Error responses:**
- `400` — invalid request body
- `429` — rate limit exceeded on a non-emergency request; friendly message included (never returned when the context answers trigger an emergency)
- `502` — Bedrock failure or Zod validation failure AND no emergency trigger in context answers; body: `{ "error": "ANALYSIS_FAILED", "message": "We couldn't analyse your photos. Please try again." }`

---

### `GET /api/inspections/[id]` (`src/app/api/inspections/[id]/route.ts`)

Retrieves a persisted inspection result by its UUID job identifier.

**Path parameter:**
- `id` (string, required — UUID)

**Response (200):**
```json
{ /* InspectionResult JSON */ }
```

**Response (404):**
```json
{ "error": "Inspection not found" }
```

Server-side steps:
1. Extract `id` from the path.
2. Call `DynamoDB_Store.get(id)` — `GetItem` with `PK = JOB#{id}`, `SK = JOB#{id}` and `ConsistentRead: true` (strongly consistent, because the results page reads a job immediately after it is saved).
3. If item not found → return HTTP 404.
4. Parse the stored `result` blob through `inspectionResultSchema`; if validation fails → return HTTP 500.
5. Return the validated `InspectionResult`.

---

## Rate Limiter Design (`src/lib/rateLimiter.ts`)

The Rate Limiter is a server-side module used exclusively within the `POST /api/inspect` Route Handler. It runs only for non-emergency requests: the handler calls it after the Safety Layer context-answer check, and skips it entirely when that check detects an emergency (such requests are not blocked and do not increment the counter). It enforces a maximum of 15 inspections per visitor per 24-hour rolling window.

```typescript
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;   // inspections remaining before limit (0 when blocked)
  resetAt: number;     // Unix epoch of when the window resets
}

export function checkRateLimit(
  request: NextRequest
): Promise<RateLimitResult>;
```

### Tracking Mechanism

1. **Cookie-first**: Read the httpOnly cookie `hhi_session` from the request. The cookie value is `base64url(payload).base64url(hmac)`, where `payload` encodes `{ visitorId, count, windowStart }` and `hmac = HMAC-SHA256(SESSION_SECRET, payload)`. Verification recomputes the HMAC and compares it with `crypto.timingSafeEqual` (after checking the buffer lengths match). A cookie with an invalid or tampered signature is treated as absent. If the cookie is present and valid, use `visitorId` to look up and increment the counter.
   - **Secret handling**: The signing key is read from the `SESSION_SECRET` environment variable (set in the Amplify console; listed in `.env.example`; never hard-coded). If `SESSION_SECRET` is missing or empty, the Rate Limiter does NOT throw: it ignores any cookie, does not set a cookie, limits by IP address only, and logs a single warning per process.
2. **IP fallback**: If the cookie is absent or invalid (or `SESSION_SECRET` is not configured), derive `visitorId` from the `x-forwarded-for` header (first IP) or `request.ip`. Apply the same 24-hour rolling window logic.
3. **Counter storage**: Counters are stored in DynamoDB using a separate item pattern: `PK = RATELIMIT#{visitorId}`, `SK = RATELIMIT#{visitorId}`, with a `ttl` of 24 hours from `windowStart`.
4. **Response**: If `count >= 15`, return `{ allowed: false, ... }`. The Route Handler responds with HTTP 429 and sets the `Retry-After` header to seconds until `resetAt`. The response body contains a plain-English message at or below an 8th-grade reading level.
5. **Cookie refresh**: On each allowed request, when `SESSION_SECRET` is configured, set (or refresh) the signed `hhi_session` cookie with `HttpOnly`, `SameSite=Strict`, `Secure`, `Max-Age=86400` (24 hours).

### 429 Response Body

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "You've reached the 15-inspection daily limit. Come back tomorrow to run more inspections.",
  "resetAt": "<ISO 8601 UTC>"
}
```

---

## Safety Layer Design (`src/lib/safety/safetyLayer.ts`)

The Safety Layer is a pure TypeScript module with no I/O, no Bedrock dependency, and no async code. It exports two functions: one for emergency detection and one for applying overrides.

```typescript
export interface SafetyCheckInput {
  contextAnswers: ContextAnswers;
  bedrockOutput?: string; // undefined when called before/without a Bedrock response
}
```

**Calling sequence in `POST /api/inspect`:**
1. Called once immediately after request-body validation and before the rate limit, with `bedrockOutput: undefined` — evaluates context answers only. If it returns `isEmergency: true`, the handler skips the rate limiter and Bedrock and returns the emergency result.
2. Called again after a successful Bedrock response, with `bedrockOutput` set — evaluates context answers + Bedrock output together.
If either call returns `isEmergency: true`, the emergency override is applied. If Bedrock fails and call 1 returned `isEmergency: false`, the handler returns HTTP 502 with the retry message without calling `applyOverrides`.

```typescript
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

All matching is **case-insensitive substring** search, except that `'gas'` and `'co'` match **whole words only**: a match directly preceded or followed by a letter or digit does not count (so `'gasket'` and `'taco'` do not match; `'gas'` in "gas leak" and `'co'` in "CO detector" do). "Within 200 chars" (proximity) is defined as **200 characters or fewer between the end of one term and the start of the other**, in either order. For example, `'spark'` + 200 characters + `'outlet'` triggers; with 201 characters between them it does not.

| Code | Triggers when… |
|---|---|
| `GAS_SMELL` | Input contains `'rotten egg'`, OR `'gas'` within 200 chars of (`'smell'` OR `'odor'` OR `'odour'` OR `'leak'` OR `'hiss'`) |
| `ELECTRICAL_FIRE` | Input contains (`'spark'` OR `'burning'` OR `'scorch'` OR `'smoke'` OR `'melt'`) within 200 chars of (`'outlet'` OR `'socket'` OR `'plug'` OR `'panel'` OR `'breaker'` OR `'wire'` OR `'wiring'` OR `'switch'` OR `'appliance'` OR `'electrical'`) |
| `WATER_ELECTRICAL` | Input contains (`'water'` OR `'flood'` OR `'leak'` OR `'wet'`) within 200 chars of (`'outlet'` OR `'socket'` OR `'panel'` OR `'breaker'` OR `'wiring'` OR `'electrical'`) |
| `CO_ALARM` | Input contains `'carbon monoxide'`, `'co alarm'` OR `'co detector'` |

### Override Rules (applied in `applyOverrides`)

1. If `isEmergency`:
   - Set `urgency = 'emergency'`, `isEmergency = true`.
   - Set `costRangeLow = 0`, `costRangeHigh = 0` (field suppressed in UI, not null to satisfy schema).
   - Set `jobBrief = ''` (suppressed in UI).
   - Set `diySteps = []`.
2. If `trade` (case-insensitive) contains `'electric'`, `'gas'`, `'hvac'` or `'furnace'`:
   - Set `diySteps = []`.
3. These rules are applied regardless of Bedrock output.

---

## Bedrock Client (`src/lib/aws/bedrock.ts`)

Uses AWS SDK v3 `@aws-sdk/client-bedrock-runtime` with `InvokeModelCommand`. The model is Amazon Nova Lite; the model ID is read from the `BEDROCK_MODEL_ID` environment variable. In us-east-2, use the cross-region inference profile ID (prefixed `us.`) if on-demand calls fail. The AWS region is read from `APP_AWS_REGION`.

**Credentials**: On Amplify, the server code uses the app's IAM compute role (least-privilege: the Bedrock model, the one S3 bucket, the one DynamoDB table). No access keys are stored in environment variables or code. Locally, the AWS CLI profile is used.

```typescript
export async function invokeInspectionModel(
  s3Keys: string[],
  answers: ContextAnswers
): Promise<BedrockInspectionResponse>;
```

The function:
1. Fetches pre-signed GET URLs for each S3 key (for passing image bytes to the model's vision API).
2. Builds the prompt via `buildInspectPrompt(answers)` from `src/lib/prompts/inspectPrompt.ts`.
3. Constructs the model `messages` payload with image content blocks (base64-encoded bytes) and the text prompt. Each image block's `format` (`jpeg`, `png` or `webp`) is set from the S3 object's `Content-Type`, falling back to the key's file extension; it is not always `jpeg`.
4. Calls `InvokeModelCommand` with a 20-second timeout signal (see the rationale in the `POST /api/inspect` orchestration steps).
5. Decodes the response body, extracts the JSON string from the model's reply.
6. Returns the raw parsed object (Zod validation is the caller's responsibility).

### AWS Singleton Clients

All three AWS singleton clients read credentials from the IAM compute role on Amplify (via the default credential provider chain) and use `APP_AWS_REGION` as the sole region parameter. There are no separate `BEDROCK_REGION`, `S3_REGION`, or `DYNAMODB_REGION` variables.

```typescript
// src/lib/aws/bedrock.ts
const client = new BedrockRuntimeClient({ region: process.env.APP_AWS_REGION });

// src/lib/aws/s3.ts
const client = new S3Client({ region: process.env.APP_AWS_REGION });

// src/lib/aws/dynamodb.ts
const client = new DynamoDBClient({ region: process.env.APP_AWS_REGION });
```

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

The prompt instructs the model to:
- Analyse the attached images for visible home defects.
- Use the context answers to narrow the diagnosis.
- Return a JSON object matching the `BedrockInspectionResponse` schema exactly.
- Never return `urgency: 'emergency'` (that is the Safety Layer's job).
- Use non-technical language suitable for a non-trade homeowner.
- Label cost ranges as estimates and express confidence as a decimal 0–1.
- Give `costRangeLow` and `costRangeHigh` in Canadian dollars (CAD), reflecting typical Ontario tradesperson pricing.

---

## Styling

The app uses **Tailwind CSS** (utility-first, no CSS-in-JS) with design tokens in `tailwind.config.ts`. Two themes are supported — **Normal** and **Haunted** — switched with a toggle. All UI components (DropZone, ContextForm, results components, navigation) respond to the active theme class applied at the root layout level. Theme-specific styles are expressed as Tailwind variant classes (e.g. `dark:` or a custom `haunted:` variant configured in `tailwind.config.ts`).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File type validation rejects exactly the non-allowed MIME types

*For any* current selection (empty or not) and any incoming pick containing a file with a MIME type that is not one of `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, or `video/webm`, the validator SHALL reject the addition with `UNSUPPORTED_TYPE` and the current selection SHALL be unchanged; and for any pick whose files all have one of those five MIME types (and violate no other rule), the validator SHALL report no `UNSUPPORTED_TYPE` error.

**Validates: Requirements 1.1**

---

### Property 2: Mixed-media submissions are always rejected

*For any* combination of photos and a video, whether in one pick (a pick containing at least one image and at least one video) or across picks (current photos plus an incoming video, or a current video plus incoming photos), the validator SHALL reject the addition with `MIXED_MEDIA` regardless of individual file validity, and the current selection SHALL be unchanged.

**Validates: Requirements 1.3**

---

### Property 3: Image count constraint

*For any* sequence of valid photo picks, the resulting selection SHALL contain min(5, d) files, where d is the number of distinct photos (by name, size and last-modified time) across all picks, in order of first appearance; and when d > 5, a `TOO_MANY_IMAGES` error SHALL be reported (while the first 5 photos are still accepted).

**Validates: Requirements 1.2**

---

### Property 4: Video duration constraint

*For any* numeric duration value d, the video duration validator SHALL accept d when d ≤ 30 and reject d when d > 30; a rejected video leaves the current selection unchanged, and a replacement video (added while a video is selected) is accepted only when its duration is ≤ 30 s.

**Validates: Requirements 1.4**

---

### Property 5: Image file size constraint

*For any* image file with size s added at any pick (first pick or a later one), the file size validator SHALL reject it with `FILE_TOO_LARGE` when s > 10 485 760 bytes (10 MB), the whole incoming pick SHALL be rejected, and the current selection SHALL be unchanged.

**Validates: Requirements 1.8**

---

### Property 6: Frame count for standard-length videos

*For any* video file with duration ≥ 3 seconds (and ≤ 30 seconds), the Frame Extractor SHALL return between 3 and 5 frames, and the frame timestamps SHALL be evenly distributed across the video duration.

**Validates: Requirements 3.1**

---

### Property 7: Frame count for short videos

*For any* video file with duration d where 0 < d < 3 seconds, the Frame Extractor SHALL return exactly max(1, floor(d)) frames; for 1 ≤ d < 3 the timestamps are the whole seconds 1…floor(d), and for d < 1 the single frame has timestamp 0.

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

*For any* text string that contains a trigger (case-insensitive substring match per the Safety Layer rules, where `'gas'` and `'co'` match whole words only, each two-part rule has its trigger pair placed with 200 characters or fewer between the end of one term and the start of the other, and each single-phrase rule has its phrase present), `checkEmergency` SHALL return `isEmergency: true`; and for any text that contains none of the trigger phrases, `checkEmergency` SHALL return `isEmergency: false`.

**Validates: Requirements 6.1, 6.2**

---

### Property 12: Emergency urgency override is unconditional after Bedrock

*For any* `BedrockInspectionResponse` where the context answers or Bedrock output text contain an emergency trigger, `applyOverrides` SHALL always set `urgency` to `'emergency'` regardless of the value in the Bedrock response. This override happens after Bedrock returns — there is no pre-Bedrock safety check.

**Validates: Requirements 6.3, 6.7**

---

### Property 13: Emergency results never contain cost range, job brief, or DIY steps

*For any* `InspectionResult` with `urgency === 'emergency'`, the rendered Results Page SHALL contain no cost range, job brief, or DIY step content.

**Validates: Requirements 6.5**

---

### Property 14: DIY steps suppressed for dangerous trades

*For any* `BedrockInspectionResponse` where `trade`, compared case-insensitively, contains `'electric'`, `'gas'`, `'hvac'` or `'furnace'` (e.g. `'Licensed Electrician'`, `'Gas fitter'`, `'HVAC technician'`), `applyOverrides` SHALL return a result with an empty `diySteps` array, regardless of what Bedrock returned in that field.

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

### Property 17: Every job is always persisted

*For any* inspection submission (regardless of visitor identity or session state), the `persist` function of `DynamoDB_Store` SHALL be called exactly once with the assembled `InspectionResult`.

**Validates: Requirements 14.1**

---

### Property 18: InspectionResult serialisation round-trip

*For any* `InspectionResult` object that passes `inspectionResultSchema` validation, serialising to JSON via `JSON.stringify` and then deserialising via `JSON.parse` followed by Zod `inspectionResultSchema.parse` SHALL produce an object in which every field value and type is identical to the original. The generator (`ValidInspectionResultArb`) includes the emergency shape (`urgency: 'emergency'`, `isEmergency: true`, `costRangeLow: 0`, `costRangeHigh: 0`, `jobBrief: ''`, `diySteps: []`), so emergency results are covered by the round-trip.

**Validates: Requirements 13.3**

---

### Property 19: Zod schema correctly classifies Bedrock responses

*For any* JSON object, `bedrockResponseSchema.safeParse` SHALL return `{ success: true }` if and only if the object satisfies all field type, range, and length constraints defined in the schema; otherwise it SHALL return `{ success: false }`.

**Validates: Requirements 8.3, 8.4**

---

### Property 20: Rate limiter blocks at the threshold

*For any* visitor with a count ≥ 15 submissions in the current 24-hour rolling window, the rate limiter SHALL return `{ allowed: false }` and the `POST /api/inspect` Route Handler SHALL respond with HTTP 429 before invoking the Bedrock_Client, provided the request's context answers contain no Emergency_Trigger (emergency requests bypass the limiter).

**Validates: Requirements 11.1, 11.2**

---

### Property 21: Safety trigger in context answers produces emergency regardless of Bedrock outcome

*For any* `SafetyCheckInput` where the context answers contain an Emergency_Trigger phrase, `checkEmergency` SHALL return `isEmergency: true` whether `bedrockOutput` is `undefined` (Bedrock not yet called), a valid string (Bedrock succeeded), or the property is tested in the context of a Bedrock failure scenario. Furthermore, for any submission whose context answers contain an Emergency_Trigger phrase, the `POST /api/inspect` handler SHALL return an `InspectionResult` with `urgency === 'emergency'` regardless of whether the Bedrock call succeeds, fails, or returns invalid JSON.

**Validates: Requirements 6.1, 6.3, 6.8, 6.9**

---

### Property 23: Additive selection is order-preserving and duplicate-free

*For any* current photo selection and any incoming photo pick, `mergeSelection` SHALL keep every existing item in its original order at the front of the result, SHALL contain no two items with the same (name, size, lastModified), and SHALL be idempotent for repeated input: adding the same pick a second time SHALL leave the resulting selection unchanged.

**Validates: Requirements 1.9, 1.10, 1.11**

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
| `POST /api/inspect` 429 (rate limit) | Display friendly rate-limit message; no console error |
| `POST /api/inspect` 502 (Bedrock failure or invalid response, no safety trigger) | "We couldn't analyse your photos. Please try again."; Try Again returns user to upload with files still populated |
| `POST /api/inspect` 502 (Bedrock timeout) | "Inspection timed out – please try again"; same recovery |
| 60-second client-side timeout | Abort fetch; same error copy and recovery as 502 |
| Clipboard write failure | Show selectable `<textarea>` fallback for manual copy |
| Stored result deserialisation failure | "This result could not be loaded" error page; no partial display |

### Server-Side Errors

| Scenario | HTTP Status | Response |
|---|---|---|
| Invalid request body | 400 | Zod error details |
| Rate limit exceeded | 429 | Friendly plain-English message + `resetAt` |
| S3 pre-sign failure | 500 | Generic "Upload service unavailable" |
| Bedrock service error | 502 | "Analysis temporarily unavailable" |
| Bedrock timeout (> 20 s) | 502 | "Analysis timed out" |
| Bedrock response fails Zod validation | 502 | "Analysis returned unexpected data" |
| DynamoDB write failure | 207 (partial success) | Return result to client; log DynamoDB error; result is not persisted |
| Inspection not found (`GET /api/inspections/[id]`) | 404 | "Inspection not found" |

DynamoDB write failures are non-fatal: the client receives the analysis result even if persistence fails, and the error is logged for operator visibility.

---

## Testing Strategy

### Unit Tests

Focus on pure functions and component rendering. Use **Vitest**.

Key unit test targets:
- `validateSelection()`, `validateVideoDuration()` and `mergeSelection()` — all rejection conditions (type, count, size, duration, mixed media within a pick and across picks), additive merge, duplicate ignoring, and video replacement.
- `DropZone` component (controlled `value`) — additive selection across picks, per-photo thumbnail, file name and Remove button, object URL revoked on remove/clear/unmount, "Add more photos" label shown while fewer than 5 photos are selected, "Clear selection" calling `onSelectionCleared`.
- `extractFrames()` — mock `HTMLVideoElement`; test frame count for standard/short/sub-second/boundary durations.
- `checkEmergency()` — all four trigger conditions, case variations, proximity rules, non-trigger inputs.
- `applyOverrides()` — emergency override, DIY suppression by trade, normal passthrough.
- `buildInspectPrompt()` — snapshot test of rendered prompt given known context.
- `bedrockResponseSchema` — valid/invalid JSON objects.
- `contextAnswersSchema` — whitespace, empty, length boundary.
- `urgencyLabel()` — all four values.
- `formatConfidence()` — boundary values (0, 0.5, 1.0) and mid-range values.
- `formatCurrency()` — exact CAD output with no decimals (e.g. `1200` → `CA$1,200`).
- `UrgencyBadge`, `CostRange`, `JobBrief`, `EmergencyBanner` — rendering with emergency vs. non-emergency props.
- `DataRetentionNotice` — mock `IntersectionObserver`; verify `onVisible` fires on first intersection only.
- `cacheResult()` / `readCachedResult()` — write then read round-trip, invalid JSON ignored, schema-invalid ignored, storage throwing ignored, key format `hhi_result_{id}`.
- `checkRateLimit()` — allowed under threshold, blocked at and above threshold, cookie vs. IP fallback, valid vs. tampered cookie signature, and missing `SESSION_SECRET` falling back to IP-only limiting.

### Property-Based Tests

Use **fast-check** for property-based testing. Each test runs a minimum of 100 iterations.

| Property | Generator strategy |
|---|---|
| P1 — File type validation | `fc.string()` for MIME type in an incoming pick; arbitrary current selection (null or valid photos); `fc.constantFrom(allowed types)` for valid paths |
| P2 — Mixed-media rejection | one pick: `fc.array(imageFile)` min 1 + `fc.array(videoFile)` min 1, concatenated; across picks: current photos + incoming video, and current video + incoming photos |
| P3 — Image count | `fc.array(fc.array(imageFile, { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 6 })` (a sequence of photo picks, with some repeated files) merged in turn |
| P4 — Video duration | `fc.float({ min: 0, max: 60 })`; optional current video for the replacement case |
| P5 — Image file size | `fc.integer({ min: 0, max: 20_000_000 })` for an image in a first or later pick, with an arbitrary current selection |
| P23 — Additive selection | `fc.array(imageFile, { maxLength: 5 })` (distinct current selection) + `fc.array(imageFile, { maxLength: 8 })` (incoming pick, may repeat current items); name, size and lastModified drawn from small ranges so duplicates occur |
| P6 — Frame count standard | `fc.float({ min: 3, max: 30 })` for duration |
| P7 — Frame count short | `fc.float({ min: 0.001, max: 2.999, noNaN: true })` for duration (covers d < 1; expect `max(1, floor(d))` frames) |
| P8 — Whitespace location | `fc.stringOf(fc.constantFrom(' ', '\t', '\n'))` |
| P9 — Context answer payload | `fc.record({ location: fc.string(), duration: fc.string(), recentChanges: fc.string() })` |
| P10 — Char limit | `fc.string({ minLength: 501, maxLength: 2000 })` |
| P11 — Emergency detection | `fc.string()` + inject a trigger pair (or single phrase) with a gap of 0–200 chars between the end of one term and the start of the other at a random position; `fc.string()` without trigger |
| P12 — Emergency override | `fc.record(BedrockResponseArb)` with emergency context; verify urgency |
| P13 — Emergency field suppression | `InspectionResultArb` with urgency=emergency; render; verify absent fields |
| P14 — DIY suppression | trade built from a keyword (`'electric'`, `'gas'`, `'hvac'`, `'furnace'`) with random case and random prefix/suffix; arbitrary diySteps array |
| P15 — Urgency label | `fc.constantFrom('emergency', 'urgent', 'soon', 'monitor')` |
| P16 — Confidence formatting | `fc.float({ min: 0, max: 1 })` |
| P17 — Every job persisted | `InspectionSubmissionArb`; spy on DynamoDB.persist; verify always called |
| P18 — Round-trip serialisation | `ValidInspectionResultArb` (includes the emergency shape: costs 0/0, empty `jobBrief`, empty `diySteps`, `urgency: 'emergency'`, `isEmergency: true`); `JSON.parse(JSON.stringify(x))` then schema parse |
| P19 — Zod schema classification | `fc.object()` (arbitrary JSON); compare schema.safeParse with expected validity |
| P20 — Rate limiter threshold | `fc.integer({ min: 0, max: 30 })` for count; verify allowed iff count < 15 |

Properties 1-5 and 23 call the pure functions `mergeSelection`, `validateSelection` and `validateVideoDuration` directly (no DOM, no `DropZone` rendering). Property 23 covers the additive selection semantics (order-preserving, duplicate-free, idempotent re-add).

Tag format for each property test: `// Feature: intake-and-triage, Property {N}: {property title}`

### Integration Tests

Use **Vitest with mocked AWS clients**: the AWS client modules (`src/lib/aws/*`) are mocked at module level and the Route Handlers are called directly in a Node environment. MSW is not used for these tests.

Integration test scenarios:
- Full upload + inspect happy path (mock S3 pre-sign, mock Bedrock, verify DynamoDB called).
- Rate limit enforcement (clean context answers): 15th request succeeds; 16th returns 429 before Bedrock is invoked.
- Emergency trigger in context answers: verify response has urgency=emergency and suppressed fields (Bedrock is never invoked; the pre-Bedrock Safety Layer check returns the emergency result).
- Emergency in context answers while over the daily limit: visitor counter at or over 15 and location containing `gas smell` => HTTP 200 emergency result (not 429), Bedrock never invoked, rate-limit counter not incremented, result still persisted.
- Emergency trigger in Bedrock output: verify override applied post-Bedrock.
- Bedrock Zod validation failure: verify 502 response.
- Bedrock timeout: verify 502 response.
- `GET /api/inspections/[id]` happy path: verify stored result returned.
- `GET /api/inspections/[id]` stored emergency result (costs 0, empty `jobBrief`, empty `diySteps`): verify 200 with the same result.
- `GET /api/inspections/[id]` not found: verify 404 response.
- Stored result deserialisation failure: verify error page rendered.
- Emergency result produced by the `POST /api/inspect` context-answer path (via `applyOverrides` with the placeholder) round-trips through `inspectionResultSchema` (`JSON.stringify` -> parse -> `safeParse` success, deep equal).
- Session cache helpers (`cacheResult` / `readCachedResult`): write-then-read round-trip, invalid JSON ignored, schema-invalid entry ignored, throwing `sessionStorage` ignored, key format `hhi_result_{id}`.

### Smoke Tests

- S3 bucket lifecycle rule exists and specifies 30-day expiry (single infrastructure check, not run in CI unit test suite).
