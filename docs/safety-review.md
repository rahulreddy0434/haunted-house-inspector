# Safety review

Reviewed against `.kiro/steering/safety.md`: `src/lib/safety/`, `src/lib/prompts/`, `src/app/api/inspect/route.ts`, `src/app/api/inspections/[id]/reply/route.ts`, `src/components/results/` and `src/components/pro/ProEmergencyView.tsx`. No files were edited during the review.

## High

1. **`src/lib/safety/safetyLayer.ts:169,177` and `src/components/results/ResultsView.tsx:76-77`.**
   - In an emergency, `applyOverrides` keeps the AI's `likelyIssue`, and `ResultsView` shows it under the fixed banner.
   - The AI text could contain advice such as "shut the gas valve", and it appears next to the fixed message.
   - Fix: in an emergency, replace `likelyIssue` with a fixed neutral string (or don't render it). Also clear `trade`, `followUpQuestions` and `confidence` in the stored record.

2. **`safetyLayer.ts:145,172-177`.**
   - DIY steps are removed only when the `trade` string contains `electric`, `gas`, `hvac` or `furnace`.
   - A trade such as "Heating technician", "Boiler", "Plumber" (gas water heater) or "Appliance repair" keeps its DIY steps. The rules also name heating jobs.
   - The AI's `likelyIssue` and `diySteps` text are never checked.
   - Fix: also strip DIY steps when `trade`, `likelyIssue`, `jobBrief` or the answers match a gas, electrical or heating term list (gas, boiler, heater, furnace, heating, breaker, panel, wiring, outlet, propane). Add a second filter for the steps themselves.

3. **`safetyLayer.ts:44-58`, `detect` at line 105.**
   - **Burning smell:** it is only caught when a word from `FIRE_ELECTRIC` is within 200 characters. "Burning smell from the dryer/stove/heater/ceiling light" is missed, and so are `burnt`, `charred`, `hot outlet`, `buzzing` and `arcing`. `FIRE_ELECTRIC` has no `dryer`, `stove`, `oven`, `heater`, `fuse`, `cord`, `light`, `fixture`, `power`.
   - **Water near electrics:** `WATER_ELECTRIC` (line 58) has `wiring` but not `wire`, `switch`, `light`, `fixture`, `fuse`, `cord`, `appliance` or `power`. `WATER_TERMS` has no `drip`, `puddle`, `soak`, `damp`, `moisture` or `burst`. "Water dripping from the light fixture" is missed.
   - Fix: widen the lists, and treat "burning smell" or "smoke" as an emergency on their own.

4. **`safetyLayer.ts:60,106-137`.**
   - **CO:** it matches only `carbon monoxide`, `co alarm` and `co detector`. Misses are `carbon-monoxide`, `CO monitor`, `CO beeping`, `co-alarm` and extra spaces.
   - **No text normalisation:** there is no Unicode normalisation, zero-width character removal or whitespace collapsing.
   - **English only:** the prompt targets Ontario, but French terms such as `odeur de gaz`, `monoxyde de carbone` and `étincelles` are not matched.
   - Fix: normalise text before matching (NFKC, strip accents and zero-width characters, collapse whitespace and hyphens). Add the missing CO and French terms.

5. **`src/app/api/inspect/route.ts:75-103` and `src/app/api/inspections/[id]/reply/route.ts:35-47`.**
   - Body-size, JSON and schema checks run before the safety check. Any failure returns an error instead of the emergency message.
   - On `/api/inspect`, `location` is required, so "gas smell" typed only in `recentChanges` with `location` empty gets a 400. Over-500-character fields also get a 400.
   - On reply, any body over 4096 bytes gets a 413 (`MAX_ACTION_BODY_BYTES`), even if it says "smell gas".
   - Fix: on parse or validation failure, run `checkEmergency` on the raw string values and return the emergency response if it triggers. Do this before returning the error.

## Medium

6. **`inspect/route.ts:59` (`finish`) and `reply/route.ts:53`.**
   - Both routes wait for a DynamoDB write before returning the emergency message. A slow or hanging DynamoDB call delays the message.
   - Fix: add a short timeout, or write in the background and return the message first.

7. **`inspect/route.ts:59-63`.**
   - If the save fails, the route still returns the result, but `/inspect/[id]` reads the record back from DynamoDB. If the browser's session cache is also unavailable, the user sees "Result could not be found" instead of the emergency message.
   - Fix: make the emergency client path fall back to the POST response, or retry the save for emergencies.

8. **`inspect/route.ts:152-157`.**
   - The post-AI check scans only `likelyIssue` and `jobBrief`. This is the only way to catch emergencies visible in photos, and it needs the AI to use exact trigger words near each other.
   - **Prompt (`src/lib/prompts/inspectPrompt.ts:25,30`):** it says "Do not cause alarm" and tells the AI never to return emergency. Nothing asks it to name visible hazards such as scorch marks, melted outlets or water near electrics.
   - Fix: add a required structured field to the model output, e.g. `hazardsObserved: enum[]`. Map it to emergencies in code. Change the prompt to say that danger signs must be reported plainly.

9. **`inspect/route.ts:136-150`.**
   - When Bedrock times out, fails or returns invalid output, the user gets "try again". A hazard visible in the photos gets no safety guidance.
   - Fix: add a neutral "if you smell gas, see sparks or hear a CO alarm, call 911" line to the failure state. This line must be separate from the fixed emergency message.

10. **`safetyLayer.ts:121-137`.**
    - Each answer field is checked on its own.
    - "Near the gas stove" in `location` plus "strange smell" in `recentChanges` is not caught.
    - Terms more than 200 characters apart inside one 500-character field are also missed.
    - Fix: also run the check on the joined fields, with the proximity window widened to the field length.

11. **`src/components/results/StatusPanel.tsx:270,293`.**
    - The tradesperson's question and decline reason are shown to the homeowner as-is. Nothing in code stops DIY advice for gas, electrical or heating work, e.g. "try resetting the breaker".
    - Fix: run those strings through the same DIY term check before storing or showing them, or add a fixed warning next to them.

12. **`StatusPanel.tsx:84-92`.**
    - On a 409 `JOB_IS_EMERGENCY`, the client shows the server's `message`, and only falls back to `EMERGENCY_MESSAGE` when the message equals the generic failure text. The fixed text is not pinned on the client.
    - On a network error, 413, 429 or 500 for a reply, the user sees a generic error instead of the emergency message.
    - Fix: on `JOB_IS_EMERGENCY`, always use `EMERGENCY_MESSAGE`. Consider a client-side pre-check on reply text that shows the banner immediately.

## Low

13. **`src/components/results/EmergencyBanner.tsx:19`, `UrgencyBadge.tsx:18`.**
    - The Haunted theme changes the banner and badge colours (`haunted:` classes). Wording is unchanged.
    - Fix: use one fixed high-contrast style for emergencies in both themes.

14. **`src/components/results/IssueSummary.tsx:24`.**
    - The "safely try" list renders whatever `diySteps` the server sends, with no client-side gas or electrical filter. This is safe only if finding 2 is fixed.

15. **`src/components/pro/ProEmergencyView.tsx:25,30,32-37`.**
    - It renders `emergencyNote` as received, not the fixed `PRO_EMERGENCY_NOTE`.
    - It also shows the AI `likelyIssue` and the homeowner's raw answers, although emergency jobs have no actions.
    - Fix: import the constant, and drop `likelyIssue` and answers from the emergency view and its API response.

16. **`inspect/route.ts:106-114`.**
    - Emergency requests skip the rate limiter and each one writes a DynamoDB record, so someone could write unlimited records.
    - Fix: apply a separate generous limit to emergency writes, applied after the emergency response is chosen.

17. **`src/lib/rateLimiter.ts:151`, called from the inspect route (outside the review list).**
    - It logs the full `error` object, not just the name. The other routes log only `error.name`.
    - Fix: log `error.name` only.

18. **`src/lib/prompts/inspectPrompt.ts:19-21`.**
    - The homeowner's text is placed into the prompt unescaped, so a user could try to instruct the model to give DIY steps. Code overrides reduce the impact, but see finding 2.

**Summary:** the emergency check runs before the rate limiter, Bedrock and the database, and logs contain only error names. The main risks are the narrow trigger-word lists, the AI text and DIY steps that remain in emergencies and heating jobs, and error responses that can replace the emergency message.

## Triage

| Finding | Decision | Reason |
|---|---|---|
| 1. AI `likelyIssue` and questions kept in emergencies | Fix now | Fix 1: fixed text from `messages.ts`. Trade and confidence are hidden by the UI and are not changed. |
| 2. DIY steps kept for heating and for gas/electrical text | Fix now | Fix 2: extra trade keywords and a text check on `likelyIssue` and `jobBrief`. The prompt line is updated. |
| 3. Trigger lists too narrow | Fix now | Fix 3: conservative additions only. No single words like "cord", "fuse", "switch" or "light", and no "smoke" or "burning smell" on their own (smoke alarm chirps cause false alarms). |
| 4. CO terms and normalisation | Fix now | Fix 3: normalisation and "co monitor". Not fixing: French terms. |
| 4. French terms | Not fixing | Out of scope for the Ontario English launch. |
| 5. Validation before the safety check | Not fixing | The form checks input first, so the API sees valid input in normal use. |
| 6. Waiting for the DynamoDB write | Not fixing | Accepted. A saved job is needed for the results page. |
| 7. Save-failure fallback | Not fixing | Accepted for now. |
| 8. Post-AI check and prompt | Fix now | Fix 6: danger-sign wording in the prompt. A structured `hazardsObserved` field is not added. |
| 9. No safety line when analysis fails | Fix now | Fix 7: a fixed line under the error on the home page. |
| 10. Per-field checking | Not fixing | Deliberate. It avoids false alarms from unrelated fields. |
| 11. Tradesperson text | Not fixing | Tradespeople are trusted users. |
| 12. StatusPanel emergency text not pinned | Fix now | Fix 4: a 409 `JOB_IS_EMERGENCY` always shows `EMERGENCY_MESSAGE`. |
| 13. Haunted colours on emergency banner and badge | Spec 3 | Styling work for the theme spec. |
| 14. IssueSummary has no client-side DIY filter | Fix now | Covered by fix 2 on the server. |
| 15. ProEmergencyView note | Fix now | Fix 4: shows `PRO_EMERGENCY_NOTE` from `messages.ts`. Removing the issue and answers from the view is not part of this change. |
| 16. Emergencies skip the rate limiter | Not fixing | Required by `safety.md`. |
| 17. Rate limiter logs the full error | Fix now | Fix 5: log `error.name` only. |
| 18. Homeowner text in the prompt | Fix now | Fix 6: the prompt says answers are information, not instructions. |
