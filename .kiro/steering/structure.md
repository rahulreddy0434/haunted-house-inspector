# Project Structure — Haunted House Inspector

```
haunted-house-inspector/
├── .kiro/                        # Kiro steering, hooks, and agent config
│   └── steering/
├── .amplify/                     # Amplify build config (auto-generated)
├── public/                       # Static assets (icons, OG images, etc.)
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout (fonts, global providers)
│   │   ├── page.tsx              # Home page — upload CTA
│   │   ├── inspect/
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Results page for a given inspection
│   │   ├── history/
│   │   │   └── page.tsx          # Past inspections (auth-gated)
│   │   └── api/
│   │       ├── inspect/
│   │       │   └── route.ts      # POST — trigger Bedrock analysis
│   │       ├── upload-url/
│   │       │   └── route.ts      # GET — return pre-signed S3 PUT URL
│   │       └── inspections/
│   │           └── route.ts      # GET — list user's past inspections
│   ├── components/
│   │   ├── ui/                   # Generic, reusable UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── …
│   │   ├── upload/               # Upload flow components
│   │   │   ├── DropZone.tsx
│   │   │   └── UploadProgress.tsx
│   │   ├── results/              # Results display components
│   │   │   ├── IssueSummary.tsx
│   │   │   ├── UrgencyBadge.tsx
│   │   │   ├── CostRange.tsx
│   │   │   └── JobBrief.tsx
│   │   └── map/                  # Leaflet wrapper (client-side only)
│   │       └── TradeMap.tsx
│   ├── lib/
│   │   ├── aws/                  # AWS SDK client singletons
│   │   │   ├── bedrock.ts
│   │   │   ├── s3.ts
│   │   │   └── dynamodb.ts
│   │   ├── prompts/              # Bedrock prompt template functions
│   │   │   └── inspectPrompt.ts
│   │   ├── validation/           # Zod schemas
│   │   │   ├── uploadSchema.ts
│   │   │   └── inspectionSchema.ts
│   │   └── utils/                # Pure utility functions
│   │       ├── formatCurrency.ts
│   │       └── urgencyLabel.ts
│   ├── types/                    # Shared TypeScript types and interfaces
│   │   ├── inspection.ts
│   │   └── bedrock.ts
│   └── hooks/                    # Custom React hooks
│       ├── useUpload.ts
│       └── useInspection.ts
├── .env.local                    # Local dev secrets (gitignored)
├── .env.example                  # Template — committed, no real values
├── .gitignore
├── amplify.yml                   # Amplify build spec
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Naming conventions

- **Files & folders** — `kebab-case` for directories, `PascalCase` for React component files, `camelCase` for everything else.
- **Components** — one component per file; named export matches file name.
- **Route handlers** — always named `route.ts`; HTTP method determines the exported function name (`GET`, `POST`, etc.).
- **Lib modules** — named exports only (no default exports from lib files).

## Import rules

- Use the `@/` path alias for all imports from `src/` (configured in `tsconfig.json`).
- Never import AWS SDK clients directly inside components — go through the `/lib/aws/` singletons.
- Never import server-only modules in Client Components; use the `server-only` package to guard them.

## Data flow summary

```
Browser → Route Handler → lib/aws/bedrock.ts → Amazon Bedrock
                        → lib/aws/s3.ts       → Amazon S3
                        → lib/aws/dynamodb.ts → Amazon DynamoDB
```

All user-facing state lives in React; all AWS state lives in DynamoDB + S3. Route handlers are the only bridge.
