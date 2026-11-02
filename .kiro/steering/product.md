# Product — Haunted House Inspector

## What it is

Haunted House Inspector is a web app for homeowners who have a home problem they can see but can't diagnose. The user uploads a short video or one or more photos of the issue. The app analyses the media and returns:

- **Likely issue** — a plain-English description of what the problem probably is
- **Trade** — which tradesperson they need (e.g. plumber, electrician, roofer, structural engineer)
- **Urgency** — a simple three-tier label: *Urgent (act today)*, *Soon (within a week)*, or *Monitor (keep an eye on it)*
- **Rough cost range** — a ballpark in local currency so the homeowner can budget before calling anyone
- **Job brief** — a short paragraph the homeowner can paste into a message to the tradesperson, summarising what was observed and what the AI suspects

## Who it is for

Homeowners and renters who are not trade professionals. The tone and language must always assume zero technical knowledge.

## Core user journey

1. User lands on the home page and sees a clear call to action: "Upload a photo or video of your problem."
2. User uploads media (drag-and-drop or file picker). Max one video (≤60 s) or up to 5 photos per submission.
3. A brief loading state ("Inspecting your home…") plays while Bedrock analyses the media.
4. Results page shows the five outputs listed above in a clean, scannable layout.
5. User can copy the job brief to clipboard with one click.
6. User can start a new inspection or view past inspections (if signed in).

## Out of scope (v1)

- Booking or connecting to actual tradespeople
- Price quoting from real contractors
- Structural engineering sign-off or any certified assessment
- Real-time video calls or live chat

## Tone of voice

Reassuring and practical. Avoid alarm unless the safety rules in `safety.md` are triggered. Never over-promise accuracy — always frame results as a likely diagnosis, not a definitive one.
