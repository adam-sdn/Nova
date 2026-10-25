# Care Loop (working title): hackathon app

A multilingual patient-flow system for an emergency department, with AI translation that is checked by
independent models and rules and confirmed by the doctor.
Three role windows share one live record: **Patient** (phone-width), **Nurse**, **Doctor**. There is no interpreter role.
AI agents cut staff workload. Humans make every clinical decision.

Before each milestone read `docs/SPEC.md` (the relevant section). Before calling a milestone done,
check `docs/ACCEPTANCE.md`. Milestone prompts are in `docs/PROMPTS.md`.

## Hard rules (never break; starred rules must have automated tests)

1. Synthetic data only. Never add real patient data, real names or real phone numbers.
2. * The patient-facing API returns only messages in state `delivered` (passed every check, then confirmed by the
   doctor's Send), pre-approved phrases from `data/phrases.json`, and released results packs. Never drafted, checked,
   ready_for_doctor, flagged, held or escalated content. One function decides this: `getPatientVisibleContent()`.
   Everything patient-facing goes through it.
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
11. The translator, back-translator and AI verifier must be three different model families (validated from config).
    Consent-type messages are never delivered by the app: consent goes through the hospital interpreter service
    outside the app, and the doctor records an attestation.

## Stack (confirmed in Stage 0)

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5 strict + Tailwind 4, SQLite via better-sqlite3
(local file at `DB_PATH`), zod 4 at API boundaries, Vitest for unit tests, Playwright for the end-to-end smoke test.
Live state: each window polls `GET /api/state` every 1 to 2 seconds (`usePoll` in `lib/ui`). Run locally for the demo.
TypeScript stays on 5.x: TypeScript 7 has no JS API, which `next build` needs.
The shared contract (endpoints, owners, types) is `docs/CONTRACT.md`.

Commands:

- `npm run dev` (add `-- -p 3002` for another port) · `npm run build` · `npm start`
- `npm test` (Vitest, in-memory DB) · `npm run test:e2e` (Playwright; starts its own dev server on port 3100 with `./care-loop-e2e.db`)
- `npm run seed` (reset `DB_PATH` and fill it with synthetic patients) · `npm run privacy:selftest` · `npm run typecheck`
- Setup: copy `.env.example` to `.env.local` and set `MASTER_KEY_BASE64`; `npx playwright install chromium` once for e2e.

## Layout

```
app/                 pages and API routes (/, /patient, /nurse, /doctor, /demo)
lib/ai.ts            the only place that calls an AI provider (plus MOCK_AI fixtures)
lib/privacy/         tested helpers: envelope encryption, pseudonymise, audit hash chain
lib/contracts/       shared zod schemas and types for every route and screen
lib/state/           status machine (machine.ts), services, views, patient visibility gate, seed
lib/rules/           safety checker, enquiry tiers, priority rules (pure functions, unit tested)
lib/ui/              Button, Chip, Panel, Card, usePoll and the design tokens (app/globals.css)
data/config.json     stages, tiers, thresholds, fixed wording (placeholders until a clinician fills them)
data/demo-defaults.json  DEMO-ONLY values used where config still says TODO(clinician); /demo shows a marker
tests/, e2e/         Vitest service tests and Playwright smoke tests
docs/                SPEC.md, ACCEPTANCE.md, PROMPTS.md, PARALLEL_PLAN.md, CONTRACT.md
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
- Approved mockups for the Nurse and Doctor screens are in `docs/design/` (read `docs/design/README.md` first).
  Match their layout, copy and styles. They are references, not code to import. Only the Patient screens have no mockup: build them from SPEC section 6 in the same style.
