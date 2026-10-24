# Care Loop (working title): hackathon app

A multilingual, human-verified patient-flow system for an emergency department.
Four role windows share one live record: **Patient** (phone-width), **Nurse**, **Doctor**, **Interpreter**.
AI agents cut staff workload. Humans make every clinical decision.

Before each milestone read `docs/SPEC.md` (the relevant section). Before calling a milestone done,
check `docs/ACCEPTANCE.md`. Milestone prompts are in `docs/PROMPTS.md`.

## Hard rules (never break; starred rules must have automated tests)

1. Synthetic data only. Never add real patient data, real names or real phone numbers.
2. * The patient-facing API returns only content a human has verified or released, plus pre-approved
   phrases. One function decides this: `getPatientVisibleContent()`. Everything patient-facing goes through it.
3. AI never sets triage priority, urgency, diagnoses, doses, test orders or outcomes. Humans do.
4. * Enquiry priority: AI may raise it, never lower it. The nurse can always override.
5. * Urgent and red-flag wording is fixed text from `data/config.json`, written by a clinician. Never AI-generated.
6. All AI calls go through `lib/ai.ts`. `MOCK_AI=1` must work with no network (browser speech aside).
7. Before any AI call, pseudonymise with `lib/privacy`. Store sensitive fields with `encryptField`.
   Audit entries hold hashes, never plaintext. Never log plaintext patient content.
8. Clinical content you do not know (red flags, tier tables, note template, test list, wording):
   leave a clearly marked placeholder `TODO(clinician)`. Never invent it.
9. No "zero-knowledge" and no outcome claims in UI copy. Label demo screens "Demo data".
10. Do not add dependencies, network calls outside `lib/ai.ts`, or secrets in the repo without asking first.

## Stack (confirm in M0, then update this section)

Default: Next.js (App Router) + TypeScript strict + Tailwind, SQLite via better-sqlite3 (local file),
zod at API boundaries, Vitest for unit tests, Playwright for the end-to-end smoke test.
Live state: each window polls `GET /api/state` every 1 to 2 seconds. Run locally for the demo.

Commands (fill in during M0): `npm run dev`, `npm test`, `npm run test:e2e`, `npm run seed`, `npm run build`.

## Layout

```
app/                 pages and API routes (/, /patient, /nurse, /doctor, /interpreter, /demo)
lib/ai.ts            the only place that calls an AI provider (plus MOCK_AI fixtures)
lib/privacy/         tested helpers: envelope encryption, pseudonymise, audit hash chain
lib/state/           status machine, events, repositories
lib/rules/           safety checker, enquiry tiers, priority rules (pure functions, unit tested)
data/config.json     stages, tiers, thresholds, fixed wording (placeholders until a clinician fills them)
docs/                SPEC.md, ACCEPTANCE.md, PROMPTS.md
```

## How to work

- Use plan mode first, wait for approval, then implement. One milestone per session. Do not start the next one.
- Write failing tests first for rules and state transitions, then make them pass.
- Keep modules small. Validate every API input with zod. Rules in `lib/rules` are pure functions.
- Finish every milestone by running the tests and reporting each acceptance item as PASS or FAIL with evidence.
- Commit after each milestone with a clear message.
- If the spec is ambiguous or a clinical detail is missing, ask. Do not guess.

## UI basics

- Fonts: IBM Plex Sans and IBM Plex Mono (IDs). Tokens are in SPEC.md section 13.
- Status is always shown with text plus an icon, never colour alone. Touch targets are at least 44px.
- Patients are shown by ID (A-102). Names are hidden on staff boards by default, with a "Show names" toggle.
