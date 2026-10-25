# Parallel build plan (git worktrees)

Goal: a running MVP as fast as possible, using several Claude Code sessions at once without them colliding.
Read together with docs/SPEC.md, docs/ACCEPTANCE.md and docs/PROMPTS.md.

## What "MVP running" means

A presenter opens `/`, opens the three role windows, presses Reset and Seed, and runs this loop with `MOCK_AI=1`
and typed input (no live speech):

1. Patient checks in and gets an ID (A-###). A card appears on the nurse board.
2. Nurse calls for triage and completes triage with a priority. The card moves to Triaged.
3. Doctor sees the patient in Ready to be seen with an AI summary and presses Consult now.
4. Nurse sees an escort request and presses Patient is with the doctor. The card moves to Doctor Consultation.
5. Doctor starts the session and types lines. The translation agent (translator, back-translator, rule checker, AI verifier) checks each line; the doctor reads "The patient will read: <back-translation>" and taps Send. The patient sees a line only after it passes the checks and the doctor sends it. A consent line is held and escalated to the hospital interpreter service.
6. Doctor completes the session with tests. Nurse updates a test. The card goes to Awaiting Decision.
7. Doctor records a decision and releases the results pack. The patient sees the pack.
8. Enquiries: the patient sends one and the nurse inbox shows a suggested priority. "I feel worse" shows fixed urgent text and alerts the nurse.

Not in the MVP: live speech, a real AI provider, the encryption toggle page, the accessibility pass, translation of the
results pack beyond pre-approved phrases.

## Stages and rough time (my estimates; real speed depends on Claude Code and your plan limits)

| Stage | Where | Sessions | Rough time |
|---|---|---|---|
| 0 Foundation | main checkout | 1 | 1.5 to 2.5 hours |
| 1 Parallel build | 4 worktrees | 4 | 2 to 3 hours |
| 2 Merge and integrate | main checkout | 1 | 1 to 1.5 hours |
| 3 Stretch | 2 worktrees | 2 | as time allows |

Do not create worktrees until Stage 0 is finished, tested and committed to main. Worktrees branch from what is
committed, so anything uncommitted is missing from them.

---

## Stage 0: foundation (main checkout, one session)

Why first: the parallel sessions need one shared contract (types, status machine, API shapes, UI primitives).
If they invent their own, merging will hurt.

Prompt (use plan mode first):

```
Read CLAUDE.md and all of docs/. Goal: build the foundation that four parallel sessions will build on.
Deliver, with tests where marked:
1. Scaffold (Next.js App Router, TypeScript strict, Tailwind, better-sqlite3, zod, vitest, playwright). Update CLAUDE.md commands.
2. `/` onboarding page with three cards (Patient, Nurse, Doctor) opening their routes in new windows. Empty placeholder pages for each route.
3. SQLite schema from SPEC section 10 and repository functions. Sensitive fields stored with lib/privacy encryptField.
4. The status machine from SPEC section 5 with guards. TESTS for every legal and illegal transition, ID generation (A-###, unique, never reused the same day), and audit entries for every transition.
5. API route STUBS for every route in SPEC section 11: zod-validated, guard-checked, calling the real state machine, returning the new state. A stub may return fixture data but must enforce transitions.
6. lib/contracts: zod schemas and TypeScript types shared by all routes and screens.
7. lib/ui: Button, Chip (with Urgent, High, Routine, Long wait, Note, Escort variants, text plus icon), Panel, Card, and the design tokens from SPEC section 13, plus a usePoll(url, ms) hook.
8. lib/ai.ts with MOCK_AI fixtures and a wrapper that pseudonymises text before any provider call.
9. getPatientVisibleContent() with a test over every message and pack status (ACCEPTANCE F5).
10. data/config.json copied from config.example.json, plus data/demo-defaults.json with clearly labelled DEMO-ONLY numeric defaults (long wait, wait bump, a tiny demo red-flag phrase list, doctors) used while config values are still TODO(clinician). /demo shows a visible "Demo defaults in use" marker.
11. Seed script and /demo page (Reset, Seed, simulate arrival, toggle MOCK_AI).
12. docs/CONTRACT.md: a short list of every endpoint, its owner (see docs/PARALLEL_PLAN.md ownership table), its types, and how to run each screen locally.
Do not build any real screens. Finish by running npm test and npm run build, and report ACCEPTANCE A1, A2, A5, B2, C5, C10, C11, C12, C13, F5, H1, H2, H4, H5 as PASS or FAIL with evidence.
```

When it passes, review the diff yourself, commit, and merge to main. Add `.claude/worktrees/` to `.gitignore`.

---

## Stage 1: four worktrees

| Worktree | Branch (check with `git branch`) | Dev port | DB_PATH | Owns (only edit these) |
|---|---|---|---|---|
| translation | `worktree-translation` | 3001 | `./care-loop-translation.db` | `lib/agents/translation/**`, `data/drugs.json`, the message routes (`app/api/sessions/[id]/messages/**`: create, send, recheck, escalate, attest) |
| patient | `worktree-patient` | 3002 | `./care-loop-patient.db` | `app/patient/**`, `components/patient/**`, `app/api/checkin/**`, `app/api/enquiries/route.ts` (create), `data/phrases.json` |
| nurse | `worktree-nurse` | 3003 | `./care-loop-nurse.db` | `app/nurse/**`, `components/nurse/**`, `lib/rules/enquiry/**`, call-triage, triage, escorted, tests and enquiry handle or priority routes |
| doctor | `worktree-doctor` | 3004 | `./care-loop-doctor.db` | `app/doctor/**`, `components/doctor/**`, `lib/agents/**` (except `lib/agents/translation/**`), consult-now, session start, return and complete, decision and pack routes |

Shared files (only the Stage 0 session may change them): `lib/state/**`, `lib/contracts/**`, `lib/ui/**`, `lib/privacy/**`,
`lib/ai.ts`, `lib/config.ts`, `data/config*.json`, `app/layout.tsx`, `app/page.tsx`, `app/demo/**`, `docs/CONTRACT.md`.

Layout guides: `docs/design/*.dc.html` (approved mockups) and `docs/design/frames/*.webp` (layout frames). Visual style
is still to be decided: match layout and copy, keep the SPEC section 13 tokens.

### Setting up each worktree
Desktop app: start a new session in the repo with the worktree checkbox ticked. CLI: `claude --worktree translation`.
Then, in that session, first run: `npm install`, copy `.env.local` from the main checkout, set `DB_PATH` as in the table, and
start the dev server on that worktree's port (`npm run dev -- -p 3002`). Each worktree needs its own database file or sessions
will overwrite each other's data.

### Rules block (paste at the top of every Stage 1 prompt)

```
You are one of four parallel sessions. Read CLAUDE.md, docs/CONTRACT.md and docs/PARALLEL_PLAN.md first.
Only edit the paths this worktree owns. Never change the status machine, the contracts or lib/ui.
If you truly need a change in a shared file, make the smallest additive change and list it under SHARED CHANGES in your final report.
Use MOCK_AI=1. Write failing tests first for rules. Commit often on this branch. Do not merge.
Finish by running npm test and npm run build, then report each listed acceptance item as PASS or FAIL with evidence.
```

### Nurse worktree prompt

```
[rules block]
Read CLAUDE.md, docs/SPEC.md sections 4, 5, 6 (Nurse), 13 and docs/CONTRACT.md.
UI reference: docs/design/nurse-board.dc.html. Match layout, copy and styles exactly.

Goal: build the nurse dashboard as a working UI connected to the shared state. No real AI yet.

Build:
1. The seven-column Kanban board polling GET /api/state?role=nurse every 2 seconds.
2. Cards showing ID, initials (names via toggle), language, priority, status text, time in stage, chips (Long wait, Escort requested, Notes capturing, Urgent enquiry, Enquiry, Interpreter needed). Consultation cards show "with Dr X" and session number. Diagnostics cards list tests and their states.
3. Escort requests strip above the board with "Patient is with the doctor" and "Can't find patient" buttons wired to the API.
4. Enquiries inbox on the far right with All/Urgent/High/Routine filter tabs. Each item shows the patient's words, a HARDCODED priority suggestion (no AI yet, just a fixed label), and Open card and Mark handled buttons.
5. Triage actions: Call for triage, Complete triage (priority input and note), update test states, Move to Awaiting Decision.
6. Show names toggle and Reset demo button.
7. The "I feel worse" alert shows as an Urgent chip on the card and at the top of the enquiries inbox.

Hardcode the enquiry priority as High for anything containing pain or dizzy, Urgent for anything containing breath or chest, Routine for everything else. Add a TODO(ai) comment on that function.

No AI calls. No encryption yet. Use the shared lib/ui components and lib/contracts types. Call only the API stubs from CONTRACT.md.

Write tests for: the priority hardcode function, the status chip logic, the "I feel worse" card flag.
Run npm test and npm run build. Report ACCEPTANCE C1, C2, C6, D1, D6, D7, I2, I4 as PASS or FAIL with evidence.
```

### Doctor worktree prompt

```
[rules block]
Read CLAUDE.md, docs/SPEC.md sections 5, 6 (Doctor), 13 and docs/CONTRACT.md.
UI reference: docs/design/doctor-board.dc.html. Match layout, copy and styles exactly.

Goal: build the doctor dashboard as a working UI connected to the shared state. No real AI yet.

Build:
1. Ready to be seen queue polling GET /api/state?role=doctor every 2 seconds, sorted by priority then wait time.
2. Each row shows ID, priority, initials, language, wait time, Long wait chip, enquiry chip, and a HARDCODED summary ("Patient reported [reason from intake]"). Add a TODO(ai) comment on the summary.
3. Profile panel: reason for visit, the hardcoded summary, triage vitals (show [from triage] as placeholder), Consult now button.
4. Session frame: Patient ID, Doctor ID, Session number in the header. Waiting state with a stepper (Called, Nurse notified, Patient escorted, In session). Start session disabled until the nurse confirms via the API. Return to queue button.
5. In-session view: Conversation panel with typed input only (no speech yet, add a TODO(speech) comment). Draft note panel with the template sections from config, each editable. Tests to order (add/remove). Complete buttons (send for tests, to decision).
6. Message cards showing status chips (Checking, Ready to send, Held) and a "The patient will read: [back-translation placeholder]" box. Send, Edit, Escalate buttons. Hardcode the back-translation as "[Translation pending AI integration]" with a TODO(ai) comment.
7. Decision screen: Discharge or Admit, doctor only.

No AI calls. No real translation. Use lib/ui and lib/contracts. Call only the API stubs.

Write tests for: session state transitions, Start session disabled guard, Complete requires a signed note.
Run npm test and npm run build. Report ACCEPTANCE C3, C4, C5, C7, C8, E1, E2, E3, E4, E6, E7 as PASS or FAIL.
```

### Patient worktree prompt

```
[rules block]
Read CLAUDE.md, docs/SPEC.md sections 5, 6 (Patient), 13 and docs/CONTRACT.md.

Goal: build the phone-width patient screens connected to the shared state. No real AI yet.

Build:
1. Check-in screen: language picker, name field, reason for visit, consent checkbox, automated-assistant notice. Submit calls POST /api/checkin and shows "Your ID: A-###".
2. Status screen: ID always visible, language switch, large-text toggle. Status feed polling GET /api/state?role=patient every 2 seconds, showing hardcoded English phrases per status column (add TODO(i18n) comments, one phrase per status, clinician to approve).
3. Enquiry box: open in Triage Waiting, Triaged, Diagnostics, Awaiting Decision. Text input and submit. Closed during Doctor Consultation and after Done.
4. "I feel worse" button: always visible in waiting states. Shows hardcoded urgent wording from config and calls the enquiry API with tier=urgent.
5. Escort alert: "A nurse is coming" message with an "I am here" tap button.
6. In-session view: shows only messages in state=delivered. Pending messages show "Your message is being checked." Never show drafted, flagged or held messages.
7. Results pack view: shown only after pack status=released. Shows a follow-up button.

No AI, no translation, no audio yet. Use lib/ui and lib/contracts.

Write tests for: getPatientVisibleContent returns only delivered messages, enquiry box closed states, consent required on check-in.
Run npm test and npm run build. Report ACCEPTANCE B1, B3, B4, B5, D7, D8, F5, F6, G2, I3 as PASS or FAIL.
```

### Translation worktree prompt

```
[rules block]
Read CLAUDE.md, docs/SPEC.md sections 7, 9, 12 and docs/CONTRACT.md.

Goal: build the translation agent pipeline as a stub that the doctor screen can wire into. No real models yet.
All AI calls are stubs with TODO(ai) comments. Tests first for all rules.

Wiring (from the Stage 0 contract): register the pipeline with setMessageAgent() in lib/state/service.ts and write each
result with recordTranslationResult(). Model calls go through ctx.ai() (translateMessage, backTranslate,
verifyTranslation, each taking { model }); models come from appConfig.translation.

Build:
1. lib/agents/translation/pipeline.ts
   The agent graph with these steps in order:
   translate -> backTranslate -> ruleCheck -> aiVerify -> decision
   Each step takes the previous output and returns a typed result.
   The pipeline retries the translate step up to config.translation.maxRetries times
   when ruleCheck or aiVerify returns a failure, passing the error list back as feedback.
   After maxRetries the message state becomes held.

2. lib/agents/translation/steps/translate.ts
   MOCK_AI=1: returns "[MOCK TRANSLATION of: <source>]"
   MOCK_AI=0: calls lib/ai.ts with the translator model from config. TODO(ai).
   Input: source text, source language, target language, optional feedback from a previous attempt.
   Output: {translation: string, model: string, attempt: number}

3. lib/agents/translation/steps/backTranslate.ts
   MOCK_AI=1: returns "[MOCK BACK-TRANSLATION of: <translation>]"
   MOCK_AI=0: calls lib/ai.ts with the backTranslator model (must differ from translator). TODO(ai).
   Output: {backTranslation: string, model: string}

4. lib/agents/translation/steps/ruleCheck.ts (REAL LOGIC, no AI)
   Extract from the source text: numbers with units, drug names (from data/drugs.json,
   create a minimal file with 10 common drug names as placeholders),
   negations (not, no, never, do not, avoid, stop, never use),
   allergy words (allergic, allergy, reaction), times (today, tomorrow, daily,
   twice, morning, evening, every N hours/days).
   Extract the same from the back-translated English.
   Compare: flag any item present in source but missing or changed in back-translation.
   Output: {passed: boolean, errors: Array<{kind: string, source: string, found: string|null, severity: 'critical'|'warning'}>}
   Critical: numbers with units changed, negations dropped, drug names missing.
   Warning: times changed, allergy words missing.
   Any critical error = passed:false.

5. lib/agents/translation/steps/aiVerify.ts
   MOCK_AI=1: returns {passed: true, errors: [], model: "mock"}
   MOCK_AI=0: calls lib/ai.ts with the aiVerifier model (must differ from both others). TODO(ai).
   Input: source, translation, back-translation, ruleCheck errors.
   Output: {passed: boolean, errors: Array<{kind: string, detail: string, severity: string}>, model: string}

6. lib/agents/translation/steps/decision.ts
   Reads config for consentRequiresInterpreter and weakLanguages.
   Returns one of: routine | verify | held
   routine: ruleCheck passed, aiVerify passed, no consent keywords, language not in weakLanguages.
   verify: checks passed but has safety items (doses, drugs, allergies, negations, times).
   held: any ruleCheck critical failure after maxRetries, consent keyword detected,
   language in weakLanguages, or aiVerify passed:false after maxRetries.
   Consent keywords list (hardcode for now, TODO(clinician)):
   ["consent", "sign", "agree", "permission", "procedure", "operation", "risks", "benefits"].

7. lib/agents/translation/trace.ts
   Builds a trace object after each pipeline run:
   {messageId, attempt, steps: [{name, model, durationMs, passed, errors}], finalState, timestamp}
   Store it as trace_json on the message record.

8. lib/agents/translation/index.ts
   The public entry point: runTranslationPipeline(messageId, source, sourceLang, targetLang)
   Pseudonymises source before any step, restores after backTranslate (using lib/privacy).
   Writes message state after each attempt (drafted -> checked -> ready_for_doctor | flagged | held).
   Writes audit entry after the final decision.
   Returns {state, translation, backTranslation, ruleCheckResult, aiVerifyResult, tier, trace}

9. Patient-to-doctor direction
   runPatientTranslationPipeline(messageId, source, sourceLang)
   Translates to English only. Runs ruleCheck and aiVerify.
   No doctor confirmation needed. Writes state as ai_checked or needs_checking.
   Returns the same shape minus tier.

10. API wiring
    POST /api/sessions/:id/messages (create a doctor message, triggers the pipeline)
    POST /api/sessions/:id/messages/:msgId/send (doctor taps Send after reading back-translation)
    POST /api/sessions/:id/messages/:msgId/recheck (retriggers the pipeline after doctor edits)
    POST /api/sessions/:id/messages/:msgId/escalate (sets state=held, writes nurse chip)
    These should already be stubbed in CONTRACT.md. Wire them to the real pipeline now.

Tests (write these first, then implement):
- ruleCheck: dose changed (100mg -> 200mg), "not" dropped, drug name missing,
  time shifted (morning -> evening), unit changed (mg -> ml), extra number added,
  allergy word missing. Each must return the correct error kind and severity.
- decision: routine, verify and held cases including consent keyword and weakLanguage.
- pipeline with MOCK_AI=1: full run returns state=ready_for_doctor for a clean message.
- pipeline with MOCK_AI=1: planted critical error returns state=held after maxRetries.
- pseudonymise called before translate, restore called after backTranslate (spy test).
- model families: assert translator, backTranslator and aiVerifier configs are different strings.
- trace: every step is recorded and the final state matches.

Do not build any UI. Do not call real AI models. Do not change shared files.
List any shared file changes needed under SHARED CHANGES in your final report.

Run npm test and npm run build.
Report ACCEPTANCE F1, F2, F3, F4, F7, H2 as PASS or FAIL with evidence.
```

---

## Merge order and Stage 2

Merge into main one branch at a time, in this order: translation, patient, nurse, doctor. After each merge run `npm test` and
`npm run build`. Expect conflicts only where someone edited a shared file; those are listed under SHARED CHANGES.

Stage 2 prompt (main checkout, one session):

```
Read CLAUDE.md, docs/ACCEPTANCE.md and the rehearsal script. All four branches are merged.
Goal: make the MVP loop in docs/PARALLEL_PLAN.md run end to end.
1. Write a Playwright test that runs the rehearsal script across three separate browser contexts (patient, nurse, doctor), then run it.
2. Fix every seam it exposes (state updates not showing across windows, wrong transitions, placeholder data).
3. Confirm A3 (MOCK_AI works with Wi-Fi off), A4 (updates appear within 3 seconds), and run the full suite.
Report ACCEPTANCE A and C items with evidence.
```

## Stage 3: stretch (two worktrees, only after the MVP loop passes)

- **speech:** live speech with the browser speech API and the typed fallback, plus a real AI provider behind lib/ai.ts. Acceptance E5, E6.
- **polish:** audit page with the breach toggle, accessibility pass (I1 to I3), the results pack translation with pre-verified phrases, the demo narrative.

## If you only want three sessions
Merge the translation work into the doctor session, but keep the safety checker tests first. Do not merge patient and nurse
together: they are the two screens judges look at most.

## Risks
- Parallel sessions can drift from the contract. Keep Stage 0 strict and re-read docs/CONTRACT.md at the start of each session.
- Stubs that pass tests can still hide missing behaviour. Stage 2's end-to-end test is the real proof.
- Demo defaults (long wait, bump, red-flag demo list) are NOT clinical values. Label them as demo-only until a clinician replaces them.
- Reviewing four diffs takes real time. Review each branch before merging, especially the translation agent and patient-visibility code.
