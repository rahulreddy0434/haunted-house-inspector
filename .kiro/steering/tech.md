# Tech Stack â€” Haunted House Inspector

## Core framework
- **Next.js** (App Router) with **TypeScript**, strict mode. All new files are `.ts` or `.tsx`.
- Scaffolded with `create-next-app` (disclosed in README, as the hackathon rules require).
- Target Node.js LTS. Keep `engines` in `package.json` in sync.

## AWS
- **Region: us-east-2 (US East, Ohio) for every AWS service.** Read it from `APP_AWS_REGION`; never hard-code it.
- **Credentials:** never use access keys in code, the repo or environment variables. On Amplify, server code uses the app's IAM compute role (least privilege: only the Bedrock model, the one S3 bucket and the one DynamoDB table). Locally, use the AWS CLI profile.
- Cost guardrail: $20/month budget alert on the account.

## Hosting & deployment
- **AWS Amplify Hosting**, auto-deploys from the `main` branch on GitHub.
- Environment variables are set in the Amplify console. Never hard-code secrets.

## AI / media analysis
- **Amazon Bedrock**, server-side only.
  - Model: [Amazon Nova Lite]. The model ID comes from `BEDROCK_MODEL_ID` so it can be swapped without code changes. In us-east-2, use the cross-region inference profile ID (starts with `us.`) if on-demand calls fail.
  - Prompts live in `/lib/prompts/` as typed template functions, unit-tested separately from the API call.
  - Always request structured JSON and validate it with Zod before returning it.
- **Video handling:** extract 3â€“5 still frames from the video in the browser (HTML video + canvas). Send only the frames to the server; never upload full videos.

## Safety (see safety.md)
- Safety rules live in `/lib/safety/` as pure functions with no AWS calls.
- They run AFTER the Bedrock result and always override it.
- Every safety rule has a property-based test.

## Storage
- **Amazon S3:** private bucket for uploaded images and frames. Pre-signed URLs, generated server-side, for upload (PUT) and display (GET). Bucket name from `S3_BUCKET_NAME`. Lifecycle rule deletes objects after 30 days.
- **Amazon DynamoDB:** one record per job (answers, frame keys, triage result, safety result, pro status). Single-table design. Table name from `DYNAMODB_TABLE_NAME`.

## Access (no sign-in for the hackathon)
- No accounts. Each job gets a random, unguessable ID; the job link is the only way to view it.
- The tradesperson dashboard uses a shared demo access code from `PRO_ACCESS_CODE`.

## Limits and cost controls
- Uploads: max 5 photos or 1 video of up to 30 seconds; max 10 MB per image.
- Per-visitor limit: 15 inspections per day; show a friendly message when reached.

## Maps
- **Leaflet** with **OpenStreetMap** tiles, loaded client-side only (dynamic import with `ssr: false`).

## Styling
- **Tailwind CSS**, utility-first. No CSS-in-JS. Design tokens in `tailwind.config.ts`.
- Two themes: Normal and Haunted, switched with a toggle.

## API layer
- All AWS calls happen in Next.js **Route Handlers** (`app/api/â€¦`). No AWS SDK calls from React components.
- Validate all request bodies with **Zod**.

## Testing
- **Vitest** for unit tests; **fast-check** for property-based tests.
- Run `next lint`, `tsc --noEmit` and the tests before every commit.

## Key environment variables
| Variable | Purpose |
|---|---|
| `APP_AWS_REGION` | AWS region for all services (us-east-2) |
| `BEDROCK_MODEL_ID` | Bedrock model or inference profile ID |
| `S3_BUCKET_NAME` | Upload bucket |
| `DYNAMODB_TABLE_NAME` | Jobs table |
| `PRO_ACCESS_CODE` | Demo code for the tradesperson dashboard |
| `SESSION_SECRET` | HMAC-SHA256 key for the signed `hhi_session` cookie; if unset, rate limiting uses IP only |
| `NEXT_PUBLIC_APP_URL` | Public base URL |

## Conventions
- Prefer `async`/`await` over raw Promise chains.
- Co-locate types with the code that uses them; export shared types from `/types/`.
- No `any`: use `unknown` and narrow it.