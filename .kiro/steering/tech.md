# Tech Stack — Haunted House Inspector

## Core framework

- **Next.js** (App Router) with **TypeScript** — strict mode enabled. All new files must be `.ts` or `.tsx`.
- Target Node.js LTS. Keep `engines` in `package.json` in sync.

## Hosting & deployment

- **AWS Amplify Hosting** — the app deploys via Amplify. Environment variables are managed in the Amplify console and injected at build time. Never hard-code secrets or region names; read them from `process.env`.
- Branch strategy: `main` → production, `dev` → staging.

## AI / media analysis

- **Amazon Bedrock** — used server-side only (never expose AWS credentials to the browser).
  - Model selection: prefer Claude 3 Sonnet or Haiku for cost/quality balance; make the model ID an environment variable (`BEDROCK_MODEL_ID`) so it can be swapped without a code change.
  - Prompts live in `/lib/prompts/` as typed template functions so they can be unit-tested independently of the API call.
  - Always request structured JSON output from Bedrock and validate it with Zod before returning it to the client.

## Storage

- **Amazon S3** — uploaded media is stored in a private bucket. Generate pre-signed URLs server-side for both upload (PUT) and display (GET). The bucket name comes from `process.env.S3_BUCKET_NAME`.
- **Amazon DynamoDB** — inspection records (metadata + Bedrock results) stored per user. Use single-table design. The table name comes from `process.env.DYNAMODB_TABLE_NAME`.

## Maps

- **Leaflet** with **OpenStreetMap** tiles — used for any map UI (e.g. showing local trade density or pinning the inspection address). Load Leaflet client-side only (dynamic import with `ssr: false`) because it requires `window`.

## Auth

- **AWS Amplify Auth** (backed by Amazon Cognito) for user sign-in/sign-up. Guest users can run one inspection without signing in; results are not persisted for guests.

## Styling

- **Tailwind CSS** — utility-first. No CSS-in-JS libraries. Keep a consistent design token set in `tailwind.config.ts`.

## API layer

- All AWS calls happen in Next.js **Route Handlers** (`app/api/…`). No direct AWS SDK calls from React components or Client Components.
- Validate all incoming request bodies with **Zod** before processing.

## Key environment variables

| Variable | Purpose |
|---|---|
| `BEDROCK_MODEL_ID` | Bedrock model identifier |
| `BEDROCK_REGION` | AWS region for Bedrock |
| `S3_BUCKET_NAME` | Media upload bucket |
| `S3_REGION` | AWS region for S3 |
| `DYNAMODB_TABLE_NAME` | Inspection records table |
| `DYNAMODB_REGION` | AWS region for DynamoDB |
| `NEXT_PUBLIC_APP_URL` | Public base URL (used for redirects) |

## Conventions

- Prefer `async`/`await` over raw Promise chains.
- Co-locate types with the code that uses them; export shared types from `/types/`.
- No `any` — use `unknown` and narrow it.
- Run `next lint` and TypeScript compiler (`tsc --noEmit`) before every commit.
