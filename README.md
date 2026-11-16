# haunted-house-inspector
Scaffolded with create-next-app

## Tradesperson dashboard and booking

A tradesperson opens `/pro` and enters the shared access code. The dashboard lists the newest jobs. For each job the tradesperson can accept it with 1 to 3 time slots, decline it, or ask the homeowner one question. The homeowner sees the status on the results page, replies to a question or picks one offered slot, and gets a booking confirmation. Emergencies always override: an emergency job cannot be accepted, declined or booked.

### Required environment variables

- `PRO_ACCESS_CODE`: the shared access code (12 or more random characters).
- `SESSION_SECRET`: signs the tradesperson cookie (32 or more random characters). If either variable is missing, `/pro` is disabled.

### DynamoDB index and IAM

The table needs a global secondary index named `GSI1` with `GSI1PK` (hash) and `GSI1SK` (range), both strings, and an `INCLUDE` projection. Only job items carry these attributes. The app's IAM role needs one extra statement: `dynamodb:Query` on the `GSI1` index ARN only (`<table ARN>/index/GSI1`).

### Trusted proxy hops

The client IP is read from `x-forwarded-for` counted from the right, using the code constant `TRUSTED_PROXY_HOPS` (currently 2). It is not an environment variable. Re-measure it before changing it, for example after adding a custom domain or another proxy.

### Diagnostic route

The temporary diagnostic route used to measure the hop count must be deleted before launch. It has already been deleted.