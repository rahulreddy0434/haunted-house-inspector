# Requirements Document

## Introduction

The intake-and-triage feature is the core user-facing flow of Haunted House Inspector. A homeowner uploads up to 5 photos or one short video (≤30 s) of a home problem, answers 3 context questions, and receives a structured AI-powered diagnosis. Video frame extraction happens client-side before upload. A server-side rules-based safety layer always evaluates the homeowner's context answers for emergency trigger conditions, regardless of whether the Bedrock call succeeds or fails, and unconditionally overrides the AI result when a trigger is detected. Results include the likely issue, trade required, urgency level, confidence level, rough cost range, and a copyable job brief. Every job gets a random unguessable UUID; the job link is the only way to view the result. No accounts or sign-in are required.

## Glossary

- **App**: The Haunted House Inspector Next.js web application.
- **User**: A homeowner or renter interacting with the App; assumed to have no trade knowledge.
- **Visitor**: A person using the App without an account; identified by session cookie for rate-limiting purposes.
- **Submission**: A single inspection request comprising media files and context answers submitted by the User.
- **Media**: One or more image files (JPEG, PNG, WebP) or one MP4/WebM video file uploaded as part of a Submission.
- **Frame_Extractor**: The client-side browser component that extracts still frames from a video before upload.
- **Context_Form**: The UI component that presents the three context questions to the User.
- **Upload_Handler**: The client-side component responsible for obtaining pre-signed S3 URLs and uploading Media.
- **Inspect_API**: The Next.js Route Handler at `POST /api/inspect` that orchestrates Bedrock analysis and returns inspection results.
- **Safety_Layer**: The server-side code module that always evaluates the homeowner's context answers for Emergency_Trigger conditions on every request, and additionally evaluates Bedrock output when available. Detects Emergency_Trigger conditions and overrides urgency and content accordingly; runs regardless of whether the Bedrock call succeeds, fails, or times out.
- **Bedrock_Client**: The server-side AWS SDK wrapper in `lib/aws/bedrock.ts` that invokes the Amazon Bedrock vision model.
- **Inspection_Result**: The structured object returned to the client containing likely issue, trade, urgency, confidence, cost range, job brief, and follow-up questions.
- **Results_Page**: The page at `/inspect/[id]` that displays the Inspection_Result to the User.
- **DynamoDB_Store**: The server-side module in `lib/aws/dynamodb.ts` that persists Inspection_Results for every job.
- **S3_Store**: The private Amazon S3 bucket where uploaded Media is stored.
- **Urgency_Level**: One of four values: `emergency`, `urgent` (act today), `soon` (within a week), or `monitor` (keep an eye on it).
- **Emergency_Trigger**: Any of the four conditions (gas smell, sparks/burning/scorch marks, flooding near electrics, CO alarm) that activate the Safety_Layer override.
- **Job_Brief**: A short paragraph summarising the observed problem, suitable for pasting into a message to a tradesperson.

---

## Requirements

### Requirement 1: Media Upload Constraints

**User Story:** As a User, I want to upload photos or a video of my home problem, so that the App can analyse what I can see.

#### Acceptance Criteria

1. THE App SHALL reject any file whose type is not JPEG, PNG, WebP (images) or MP4, WebM (video) and SHALL display a message listing the accepted formats.
2. WHEN a User selects more than 5 image files in a single Submission, THE App SHALL reject the excess files and display a message stating the maximum is 5 photos per submission.
3. WHEN a User selects both image files and a video file in the same Submission, THE App SHALL reject the combination and display a message stating the User must submit either photos or one video, not both.
4. WHEN a User selects a video file whose duration exceeds 30 seconds, THE App SHALL reject the file and display a message stating the maximum video length is 30 seconds.
5. WHEN a User selects a valid Submission, THE App SHALL display a summary of the selected files (file names and count), and SHALL require at least 1 file to be selected before the submit action is available.
6. THE App SHALL support drag-and-drop and file-picker upload interactions on the upload page.
7. WHEN a User selects more than 1 video file in a single Submission, THE App SHALL reject the excess video files and display a message stating only one video may be submitted.
8. THE App SHALL reject any single image file exceeding 10 MB and SHALL display a message identifying the file and the applicable size limit.

---

### Requirement 2: Upload Transparency and Data Retention Notice

**User Story:** As a User, I want to know what happens to my uploaded files before I send them, so that I can make an informed decision about submitting.

#### Acceptance Criteria

1. THE App SHALL display a data retention notice on the upload page before the User submits, stating that uploaded media is stored privately in a secure cloud location accessible only to the User, and permanently deleted after 30 days.
2. THE App SHALL display the notice using plain language at or below an 8th-grade reading level, with no technical jargon, acronyms, or trade-specific terminology.
3. WHILE the data retention notice has not yet scrolled into the User's viewport, THE App SHALL disable the submit button.
4. WHEN the data retention notice scrolls into the User's viewport for the first time, THE App SHALL enable the submit button.
5. IF the User attempts to submit before the data retention notice has entered the viewport, THEN THE App SHALL scroll the notice into view and display an inline prompt indicating that the User must read the notice before submitting.

---

### Requirement 3: Video Frame Extraction

**User Story:** As a User, I want to upload a video of my problem without manual effort, so that the App can analyse representative frames automatically.

#### Acceptance Criteria

1. WHEN a User selects a valid video file, THE Frame_Extractor SHALL extract between 3 and 5 evenly spaced frames from the video in the browser before upload.
2. THE Frame_Extractor SHALL produce extracted frames as JPEG images at a minimum quality of 80/100 and with a minimum dimension of 640px on the shorter side.
3. WHEN frame extraction completes, THE App SHALL upload only the extracted frames to S3_Store, not the original video file.
4. WHEN frame extraction fails due to an unsupported format, excessive file size, or exceeded duration, THE App SHALL display an error message identifying which constraint was not met.
5. WHEN frame extraction fails due to a processing error, THE App SHALL display an error message and offer two actions: retry extraction on the same file, or switch to photo upload.
6. WHEN the selected video is shorter than 3 seconds, THE Frame_Extractor SHALL extract all available whole-second frames rather than evenly spaced frames, and SHALL proceed if at least 1 frame is extracted.
7. THE Frame_Extractor SHALL complete extraction within 15 seconds using only browser-native APIs (HTML video element and canvas); IF extraction has not completed within 15 seconds, THE App SHALL abort extraction and display an error message.
8. THE Frame_Extractor SHALL enforce a maximum video duration of 30 seconds; WHEN the selected video exceeds 30 seconds, THE App SHALL reject it and display a message stating the maximum video length is 30 seconds.

---

### Requirement 4: Pre-signed S3 Upload

**User Story:** As a User, I want my media uploaded securely, so that my files are not exposed to unauthorised access.

#### Acceptance Criteria

1. WHEN the Upload_Handler requires an upload URL, THE App SHALL request a pre-signed S3 PUT URL from `GET /api/upload-url`, supplying the file name and MIME type as query parameters, before uploading each file.
2. THE `upload-url` Route Handler SHALL generate pre-signed S3 PUT URLs server-side using the AWS region from the `APP_AWS_REGION` environment variable, with a URL expiry of no more than 15 minutes, and SHALL NOT expose AWS credentials to the browser.
3. IF the request to `GET /api/upload-url` returns an error, THEN THE Upload_Handler SHALL display an error message indicating the upload cannot proceed and SHALL NOT attempt to upload the file directly.
4. THE S3_Store SHALL be configured as a private bucket; all access SHALL be via pre-signed URLs only.
5. IF the S3 PUT request using the pre-signed URL returns an error, THEN THE Upload_Handler SHALL display an error message indicating the upload failed and SHALL offer the User the option to retry.

---

### Requirement 5: Context Questions

**User Story:** As a User, I want to describe my problem in my own words, so that the App has enough context to give a useful diagnosis.

#### Acceptance Criteria

1. THE Context_Form SHALL present exactly three questions to the User: (a) "Where in your home is the problem?", (b) "How long has this been going on?", and (c) "Has anything changed recently that might be related?".
2. THE Context_Form SHALL require the User to provide a non-empty, non-whitespace-only answer to question (a) before the Submission can be sent; a response consisting only of spaces, tabs, or newlines SHALL be treated as empty.
3. THE Context_Form SHALL treat questions (b) and (c) as optional, allowing the User to leave them blank.
4. WHEN the User submits the Context_Form, THE App SHALL include all three answers (including blank optional answers) in the Submission sent to the Inspect_API.
5. THE Context_Form SHALL limit each answer to 500 characters, SHALL block further input once the limit is reached, and SHALL display a real-time character count to the User.

---

### Requirement 6: Safety Layer — Emergency Detection and Override

**User Story:** As a User, I want the App to recognise life-threatening conditions immediately, so that I receive the correct emergency guidance without delay.

#### Acceptance Criteria

1. WHEN the Inspect_API receives a completed inspection request, THE Safety_Layer SHALL always evaluate the three Context_Form answer fields individually for Emergency_Trigger conditions, regardless of whether the Bedrock_Client call succeeds, fails, or times out.
2. THE Safety_Layer SHALL treat each of the following as an Emergency_Trigger condition, matched case-insensitively as a substring within any evaluated input: (a) 'gas smell' or 'rotten egg'; (b) 'sparks', 'burning smell', or 'scorch marks' appearing in proximity to 'outlet', 'panel', or 'appliance'; (c) 'water' appearing in proximity to 'electrical outlet', 'panel', or 'appliance' and accompanied by 'flood' or 'flooding'; (d) 'carbon monoxide alarm'.
3. WHEN any Emergency_Trigger condition is detected, THE Safety_Layer SHALL set the Urgency_Level to `emergency` regardless of the Bedrock_Client output.
4. WHILE the Urgency_Level is `emergency`, THE App SHALL display exactly the following message: "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside."
5. WHILE the Urgency_Level is `emergency`, THE App SHALL suppress and not display any of the following fields: do-it-yourself steps, remediation instructions, cost range, and job brief.
6. THE Safety_Layer SHALL be implemented as server-side code in the Inspect_API and SHALL NOT rely on the Bedrock_Client to detect or communicate Emergency_Trigger conditions.
7. WHEN the Urgency_Level is `emergency`, THE App SHALL apply the override before any Inspection_Result data is returned to the browser.
8. WHEN the Bedrock_Client call fails or times out AND the Safety_Layer detects no Emergency_Trigger condition in the context answers, THE Inspect_API SHALL return an error response to the client with a plain-language message stating 'We couldn't analyse your photos. Please try again.' and SHALL NOT return a partial Inspection_Result.
9. WHEN the Bedrock_Client call fails or times out AND the Safety_Layer detects an Emergency_Trigger condition in the context answers, THE Inspect_API SHALL return an Inspection_Result with urgency set to 'emergency' and SHALL display the emergency message, regardless of the Bedrock failure.

---

### Requirement 7: No DIY Steps for Gas or Electrical Work

**User Story:** As a User, I want the App to withhold DIY instructions for dangerous work categories, so that I am not encouraged to attempt unsafe repairs.

#### Acceptance Criteria

1. WHEN the Inspection_Result trade is `electrician` or `gas engineer`, THE Safety_Layer SHALL remove any do-it-yourself steps — defined as any instruction, numbered step, or directive that tells the user to perform hands-on physical work themselves (e.g. 'replace the fitting', 'reset the breaker', 'tighten the wire') — from the Inspection_Result before it is returned to the client, leaving the do-it-yourself steps field empty or absent in the response.
2. THE Safety_Layer SHALL apply this constraint independently of the Urgency_Level.

---

### Requirement 8: Bedrock Vision Analysis

**User Story:** As a User, I want the App to analyse my uploaded images using AI, so that I receive a useful diagnosis without needing trade expertise.

#### Acceptance Criteria

1. WHEN all Media has been uploaded to S3_Store and the Context_Form answers have been received, THE Inspect_API SHALL invoke the Bedrock_Client with the uploaded images and the context answers.
2. THE Bedrock_Client SHALL use the model identified by the `BEDROCK_MODEL_ID` environment variable; the default model is Amazon Nova Lite, using the cross-region inference profile ID (prefixed with `us.`) for on-demand calls in us-east-2 if the variable is not set.
3. THE Bedrock_Client SHALL request a structured JSON response from the model containing: `likelyIssue` (string, max 500 characters), `trade` (string, max 100 characters), `urgency` (one of `urgent`, `soon`, `monitor`), `confidence` (number between 0 and 1 inclusive), `costRangeLow` (number, 0–999999), `costRangeHigh` (number, 0–999999, must be ≥ costRangeLow), `jobBrief` (string, max 1000 characters), and `followUpQuestions` (array of exactly 2 strings, each max 200 characters).
4. WHEN the Bedrock_Client receives a response, THE Inspect_API SHALL validate it against a Zod schema before passing it to the Safety_Layer.
5. IF the Bedrock_Client response fails Zod validation, THEN THE Inspect_API SHALL return an HTTP 502 error to the client with a message indicating analysis failed and the User should try again.
6. THE Bedrock_Client SHALL be invoked server-side only and SHALL NOT be called from any React component or Client Component.
7. IF the Bedrock_Client call returns a service error or does not respond within 30 seconds, THEN THE Inspect_API SHALL return an HTTP 502 error to the client with a message indicating analysis is temporarily unavailable and the User should try again.

---

### Requirement 9: Inspection Result Display

**User Story:** As a User, I want to see a clear summary of the diagnosis on the results page, so that I know what to do next.

#### Acceptance Criteria

1. THE Results_Page SHALL display the following fields from the Inspection_Result: likely issue description, trade required, Urgency_Level label, confidence level, cost range, job brief, and two follow-up questions.
2. THE Results_Page SHALL display the Urgency_Level using the following plain-English labels: `urgent` → "Urgent — act today", `soon` → "Soon — within a week", `monitor` → "Monitor — keep an eye on it", `emergency` → "Emergency".
3. THE Results_Page SHALL display the confidence level as a percentage rounded to the nearest whole number, prefixed with a tilde (~) to indicate it is approximate, and labelled as "AI confidence in this diagnosis".
4. THE Results_Page SHALL display the cost range labelled as "rough range, not a quote".
5. THE Results_Page SHALL prefix every confidence value with a tilde (~) when displayed, including values that round to 100%, to reflect the probabilistic nature of the diagnosis.
6. THE Results_Page SHALL provide a one-click copy-to-clipboard action for the Job_Brief and SHALL display a confirmation indicator (e.g. 'Copied!') for at least 2 seconds after a successful copy.
7. WHEN the clipboard write fails, THE Results_Page SHALL display a fallback that allows the User to manually select and copy the Job_Brief text.

---

### Requirement 10: Loading State

**User Story:** As a User, I want to see feedback while the App is analysing my media, so that I know the App is working and have not lost my submission.

#### Acceptance Criteria

1. WHILE the Inspect_API has received the Submission and has not yet returned a response, THE App SHALL display a loading indicator with the message "Inspecting your home…".
2. WHEN the Inspect_API returns a response or an error, THE App SHALL remove the loading indicator.
3. WHEN the Inspect_API returns an error, THE App SHALL remove the loading indicator, display a message describing what went wrong, and present a "Try again" action that returns the User to the upload step with their previously selected media still populated.
4. IF the Inspect_API has not returned a response within 60 seconds, THE App SHALL abort the request, remove the loading indicator, and display an error message indicating the inspection timed out with an option to try again.

---

### Requirement 11: Per-Visitor Inspection Rate Limit

**User Story:** As a Visitor, I want to understand when I have reached the daily usage limit, so that I know why I cannot start a new inspection and what to do next.

#### Acceptance Criteria

1. THE App SHALL permit each Visitor a maximum of 5 inspections per calendar day; WHEN the Visitor has reached this limit, THE App SHALL display a friendly message stating that the daily limit has been reached and inviting the Visitor to return tomorrow.
2. WHEN a Visitor attempts to start a new inspection after reaching the daily limit, THE App SHALL prevent the Submission from being sent and SHALL display the limit-reached message without returning an error to the console.
3. THE App SHALL track the per-Visitor inspection count using a session cookie or, where a session cookie is unavailable, by IP address; the tracking mechanism SHALL be an implementation detail resolved in the design phase.
4. IF a Visitor's session cookie is cleared or absent, THE App SHALL apply the rate limit based on the available identifier (IP address) rather than blocking all access.
5. THE App SHALL display the limit-reached message in plain language at or below an 8th-grade reading level, with no technical jargon.

---

### Requirement 12: S3 Media Lifecycle

**User Story:** As a User, I want my uploaded media to be automatically deleted after a set period, so that my home images are not stored indefinitely.

#### Acceptance Criteria

1. THE S3_Store SHALL be configured with an object lifecycle rule that deletes all uploaded Media 30 days after the object creation date.
2. THE App SHALL display the 30-day deletion period to the User as part of the data retention notice required by Requirement 2.

---

### Requirement 13: Round-Trip Integrity of Inspection Result Serialisation

**User Story:** As a developer, I want Inspection_Result objects to serialise and deserialise without data loss, so that results stored in DynamoDB and returned to the client are faithful to the original analysis.

#### Acceptance Criteria

1. THE Inspect_API SHALL serialise the Inspection_Result to JSON for storage and transmission.
2. THE App SHALL deserialise the JSON representation of an Inspection_Result back into a typed object for display.
3. FOR ALL Inspection_Result objects that pass schema validation, serialising then deserialising SHALL produce an object in which every field value and type is identical to the original.
4. WHEN deserialisation of a stored Inspection_Result fails schema validation, THE App SHALL display an error message indicating that the result could not be loaded, rather than display a partially populated Results_Page.

---

### Requirement 14: Job Persistence and Retrieval

**User Story:** As a Visitor, I want to view my inspection result via its unique link, so that I can return to the result without needing an account.

#### Acceptance Criteria

1. WHEN the Inspect_API produces an Inspection_Result, THE DynamoDB_Store SHALL persist the result associated with a randomly generated, unguessable UUID job identifier.
2. THE App SHALL construct the Results_Page URL using the job UUID in the format `/inspect/[id]`, and SHALL return this URL to the browser upon successful analysis.
3. WHEN a User navigates to `/inspect/[id]`, THE App SHALL retrieve the Inspection_Result from the DynamoDB_Store using the job UUID and display it on the Results_Page.
4. IF no Inspection_Result exists for the supplied job UUID, THEN THE App SHALL display a message stating the result could not be found and offer the User the option to start a new inspection.
5. THE App SHALL NOT require any authentication or account creation to create, store, or retrieve an Inspection_Result.
