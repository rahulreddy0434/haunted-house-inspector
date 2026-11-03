# Haunted House Inspector – Build Log

A daily record of what I built, which Kiro features I used, and what went wrong.
This log feeds the Kiroween "How Kiro was used" write-up, the blog post and the social post.

---

## Nov 2, 2026 (Step 0, days 1–2)

**Done**
- Requested Kiro hackathon credits; joined the Kiro Discord (#kiroween-hackathon)
- Installed Node.js, Git, GitHub CLI and Kiro IDE
- Created the public GitHub repo with an MIT license; confirmed .kiro is not in .gitignore
- Created 4 steering docs (product, tech, structure, safety)
- Created spec 1, "Intake and triage": requirements, design and tasks

**Kiro features used**
- Vibe chat to generate the steering docs
- Spec mode for intake and triage, with safety rules written as WHEN/SHALL requirements

**Problems and fixes**
- My Kiro version had no "Generate Steering Docs" button, so I asked Kiro in chat instead
- safety.md disappeared after I clicked an undo option; I recreated it by hand
- Steering files didn't show in the panel until I turned on Auto Save and saved

---

## Nov 3, 2026 (Step 0, day 2: AWS setup and steering update)

**Done**
- Created an AWS account (Basic plan, USD $100 credit); verified phone
- Turned on MFA for the root account (authenticator app)
- Set a $20 monthly budget alert
- Using region US East (Ohio), us-east-2, for every AWS service
- Tested Amazon Bedrock in the Chat playground with a photo from my house
- Rewrote tech.md: us-east-2, no sign-in, IAM compute role (no access keys), browser frame extraction, safety and testing sections, upload limits and a per-visitor rate limit
- Had Kiro update the intake-and-triage spec to match the new tech.md

**Bedrock test**
- Model: Amazon Nova Lite
- Prompt: "You are a home repair triage assistant. From this photo, give the likely issue, which trade is needed, urgency (emergency, this week, can wait), and two follow-up questions. Reply in JSON."
- Result:
  ```json
  {
    "likely_issue": "The siding appears to be damaged or improperly installed around the window.",
    "trade_needed": "Siding or Roofing Contractor",
    "urgency": "This week",
    "follow_up_questions": [
      "Are there any signs of water damage or mold inside the affected area?",
      "Has the area around the window been exposed to extreme weather conditions recently?"
    ]
  }
  ```
- Notes: Nova Lite returned valid JSON from the first try, and the urgency and trade were sensible. The follow-up questions were useful. The app should still validate the JSON with Zod, because this was one try.

**Kiro features used**
- Steering-driven spec updates: one change to tech.md led Kiro to update requirements, design and tasks across the whole spec
- Kiro removed sign-in everywhere and added two new requirements (job persistence and a 5-per-day rate limit), new tasks, and new property tests (Property 12 for safety ordering, Property 20 for the rate limit)
- Switched the test framework to Vitest with fast-check for property-based tests

**Problems and fixes**
- Couldn't switch the console to us-east-1 (it wasn't offered on my account), so I standardized on us-east-2
- In us-east-2, Nova Lite may need the cross-region inference profile ID (starts with "us."); noted in tech.md
- Spotted a gap: the safety layer only ran after Bedrock, so an outage could hide an emergency. Asked Kiro to make safety rules run on the homeowner's answers even if Bedrock fails, with a property test for it

---

## Next: Nov 4 (Step 0, day 3)
- Scaffold the Next.js app (task 1 only) and deploy it to AWS Amplify in us-east-2
- Add "Scaffolded with create-next-app" to the README
- Book 5 calls with tradespeople and homeowners
- Shortlist 3 startup names