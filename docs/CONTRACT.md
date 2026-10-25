# Contract (Stage 0)

The shared surface that the four parallel worktrees build on. Re-read this at the start of every session.
There is no interpreter role or window: translation is the agent in SPEC section 9.
Types live in `lib/contracts/index.ts` (zod schemas + TypeScript types). Do not redefine them. If you need a change,
make the smallest additive change and list it under SHARED CHANGES in your final report (see docs/PARALLEL_PLAN.md).

## Conventions

- All bodies are JSON and validated with zod. Errors: `{ "error": { "code", "message", "issues?" } }`.
  - `400 invalid_input` / `invalid_json`: the body failed validation.
  - `403 forbidden_role`: this role may not do this.
  - `409 wrong_status` / `guard_failed`: the status machine refused the transition (SPEC section 5). Nothing was written.
  - `404 not_found`.
- Every state-changing route takes `actor: { role, id }` (demo only, no real auth). Roles: `patient`, `nurse`,
  `doctor`, `system`, `demo` (there is no interpreter role). A patient's `id` is the visit **token** from check-in. Doctor IDs come
  from `data/config.json` (`D-01`, `D-03`, `D-05`); nurse IDs are free text (`N-01`).
- Every state-changing route checks the guard in `lib/state/machine.ts`, writes in one transaction, appends an audit
  entry (hash only) and returns the new state, usually `{ visit: VisitCard, ... }`.
- Visit statuses: `arrival`, `triage_waiting`, `triaged`, `diagnostics`, `consultation`, `awaiting_decision`, `done`.
  Column labels: `COLUMN_LABELS`.

## Endpoints

Owner = the worktree that builds the real behaviour on top of the stub. Shared routes stay with Stage 0.

| Method and path | Body / query (`lib/contracts`) | Returns | Transition | Owner |
|---|---|---|---|---|
| `GET /api/state?role=nurse\|doctor[&names=1]` | `StateQuery` | `StaffState` | none | shared |
| `GET /api/state?role=patient&id=<token>` | `StateQuery` | `PatientState` (only via `getPatientVisibleContent()`) | none | shared |
| `POST /api/checkin` | `CheckinReq` (no actor) | `CheckinResult` `{visitId, displayId, token}` | T1 + T2 | patient |
| `POST /api/visits/:id/register` | `ActorOnlyReq` | `{visit}` | T2 by hand (walk-in still in To Do) | nurse |
| `POST /api/visits/:id/call-triage` | `ActorOnlyReq` | `{visit}` | T3 | nurse |
| `POST /api/visits/:id/triage` | `TriageReq` `{priority, note}` | `{visit}` (with AI summary) | T4 | nurse |
| `POST /api/visits/:id/consult-now` | `ActorOnlyReq` (doctor) | `{session, visit}` | T5 | doctor |
| `POST /api/sessions/:id/escorted` | `EscortedReq` `{outcome: with_doctor\|not_found}` | `{session, visit}` | T6 | nurse |
| `POST /api/sessions/:id/return` | `ActorOnlyReq` (doctor) | `{session, visit}` | Return to queue | doctor |
| `POST /api/sessions/:id/start` | `StartSessionReq` `{transcriptionConsent}` | `{session, visit}` | T7 | doctor |
| `POST /api/sessions/:id/complete` | `CompleteSessionReq` `{next, note, tests}` | `{session, visit}` | T8 / T9 | doctor |
| `POST /api/sessions/:id/messages` | `MessageReq` `{direction, text}` | `{message}` | runs the translation agent: doctor line ends `ready_for_doctor`, `flagged` or `held`; patient line `ai_checked` or `needs_checking` | translation |
| `POST /api/sessions/:id/messages/:msgId/send` | `SendMessageReq` (doctor of the session) | `{message}` | doctor's Send: `ready_for_doctor` to `delivered` only | translation |
| `POST /api/sessions/:id/messages/:msgId/recheck` | `RecheckMessageReq` `{text}` | `{message}` | Edit and recheck: back to `drafted`, agent runs again | translation |
| `POST /api/sessions/:id/messages/:msgId/escalate` | `EscalateMessageReq` `{reason?}` | `{message}` | `escalated` (still held); nurse card `interpreterNeeded`; audit | translation |
| `POST /api/sessions/:id/messages/:msgId/attest` | `AttestMessageReq` `{kind, reason}` | `{message}` | attestation recorded; message never delivered; clears `interpreterNeeded` | translation |
| `GET /api/visits/:id/profile` | (doctor) | reason for visit (original and English), AI summary, triage note | none; audits the decryption | doctor |
| `POST /api/visits/:id/tests/:testId` | `TestUpdateReq` `{state}` | `{visit}` | T10 | nurse |
| `POST /api/visits/:id/to-decision` | `ActorOnlyReq` (nurse or doctor) | `{visit}` | T10 Move to Awaiting Decision | nurse |
| `POST /api/visits/:id/reopen` | `ReopenReq` `{kind: more_tests\|second_look, tests}` | `{visit, session}` | T13 | doctor |
| `POST /api/visits/:id/decision` | `DecisionReq` `{outcome, results, advice, medicines}` | `{visit, pack}` | T11 (pack drafted) | doctor |
| `POST /api/visits/:id/pack/verify` | `ActorOnlyReq` (doctor) | `{visit, pack}` | pack `draft` to `verified` | doctor |
| `POST /api/visits/:id/pack/release` | `ActorOnlyReq` (doctor) | `{visit, pack}` | T12 | doctor |
| `POST /api/enquiries` | `EnquiryReq` `{visitId, kind: message\|feel_worse, text}` | `{enquiry}` | enquiry created | patient |
| `POST /api/enquiries/:id/handle` | `ActorOnlyReq` (nurse) | `{enquiry}` | Mark handled | nurse |
| `POST /api/enquiries/:id/priority` | `EnquiryPriorityReq` `{tier}` | `{enquiry}` | Nurse override | nurse |
| `POST /api/demo/reset` · `seed` · `arrival` · `advance-test` | `{}` | `{ok}` etc. | demo | shared |
| `GET` / `POST /api/demo/settings` | `DemoSettingsReq` `{mockAi}` | `{mockAi, demoDefaultsInUse}` | demo | shared |
| `GET /api/demo/audit` | | `{ok, brokenAt?, length}` | none | shared |

Routes added beyond SPEC section 11 (all needed by section 5): `register`, `return`, `to-decision`, `reopen`,
`pack/verify`, and the extra demo routes.

## What the stubs do today (replace in your worktree)

- **Enquiries** (`createEnquiry` in `lib/state/service.ts`): `feel_worse` is always `urgent`; a `message` gets a mock
  category and reason and the tier `needs_review`. The nurse worktree adds `lib/rules/enquiry` (red flags, tier table,
  time bump, raise-only, low confidence, canned answers) and calls it from here.
- **Messages** (`createMessage`): stores the line as `drafted`, then calls the registered message agent. The stub
  agent gives a mock translation and back-translation and `ready_for_doctor` (tier `verify`); patient lines get
  `needs_checking`. The translation worktree builds `lib/agents/translation` and registers it with
  `setMessageAgent()`; it writes each result with `recordTranslationResult()`, which refuses `delivered` and `escalated`
  (only the doctor's Send and Escalate set those). `MessageView` carries `tier`, `safety` (rule checks), `aiChecks`,
  `trace`, `confirmedBy`, `escalatedAt` and `attestation`. `VisitCard.interpreterNeeded` is true while an escalated
  message has no attestation. Model calls: `ctx.ai().translateMessage / backTranslate / verifyTranslation`, each with
  `{ model }` from `appConfig.translation` (three distinct families, checked at load by `assertDistinctFamilies`).
- **Packs**: the AI relays results, advice and medicines as entered; `whenToSeekHelp` is fixed text from config.

## Shared modules (Stage 0 only; import, do not edit)

| Module | What it gives you |
|---|---|
| `lib/contracts` | All enums, request schemas and view types |
| `lib/state/machine.ts` | `check(name, facts)`, `RULES`: the guards for T1 to T14 |
| `lib/state/service.ts` | One function per transition; throws `TransitionError` |
| `lib/state/views.ts` | `staffState()`, `patientState()`, `visitCard()` and friends |
| `lib/state/patientVisible.ts` | `getPatientVisibleContent()`: the only gate for patient content |
| `lib/state/db.ts` | `getCtx()` for routes, `createCtx({dbPath: ":memory:"})` for tests |
| `lib/state/seed.ts` | Reset, Seed, simulate arrival, advance test |
| `lib/ai.ts` | `ctx.ai()`: every AI call, pseudonymised; `MOCK_AI=1` fixtures in `lib/ai.fixtures.ts` |
| `lib/config.ts` | `appConfig` (config.json with DEMO-ONLY fallbacks), `phraseTable` |
| `lib/api.ts` | `post(schema, fn)` and `get(schema, fn)` route wrappers |
| `lib/ui` | `Button`, `Chip`, `Panel`, `Card`, `Column`, `Mono`, `DemoTag`, icons, `usePoll`, `postJson`, `sinceLabel` |

Tests: `tests/helpers.ts` gives `testCtx()` (in-memory DB, fixed clock with `advance(minutes)`) and sample actors.

## Running a screen locally

Each worktree needs its own port and database file (PARALLEL_PLAN.md Stage 1):

| Worktree | Port | `DB_PATH` |
|---|---|---|
| main | 3000 | `./care-loop.db` |
| translation | 3001 | `./care-loop-translation.db` |
| patient | 3002 | `./care-loop-patient.db` |
| nurse | 3003 | `./care-loop-nurse.db` |
| doctor | 3004 | `./care-loop-doctor.db` |

```bash
npm install
cp ../path-to-main/.env.local .env.local   # holds MASTER_KEY_BASE64; never commit it
# set DB_PATH in .env.local as in the table, then:
npm run seed
npm run dev -- -p 3002
```

Then open `http://localhost:<port>/demo`, press Reset and Seed, and open your screen. The patient window needs a
token: check in through `/patient`, or call `POST /api/checkin` and use `?token=` as your screen decides.

## Follow-ups and the AI Clinical Assessment (doctor)

| Endpoint | Body / query | Returns | Notes |
|---|---|---|---|
| `POST /api/sessions/:id/draft-note` | `{actor, sections, transcript}` | `{draft: {[section]: {text, fromLine, toLine}}}` | AI draft of the Clinical Assessment; doctor in the session only; audited `note.ai_draft` |
| `POST /api/sessions/:id/complete` | as before | adds `followUps: FollowUpView[]` | after completion, AI drafts follow-ups from the signed note (`suggested`) |
| `GET /api/follow-ups?doctor=&code=` | needs the open session code | `{followUps}` | dismissed ones are hidden; never in the patient view |
| `POST /api/follow-ups/:id/confirm` | `{actor, text?}` | `{followUp}` | suggested → confirmed, optional rewording |
| `POST /api/follow-ups/:id/done` | `{actor}` | `{followUp}` | confirmed → done |
| `POST /api/follow-ups/:id/dismiss` | `{actor}` | `{followUp}` | suggested → dismissed |

Only the doctor who saw the patient can act on a follow-up. Text is encrypted; audit holds hashes.
