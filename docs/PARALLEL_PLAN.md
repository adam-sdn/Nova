# Parallel build plan (git worktrees)

Goal: a running MVP as fast as possible, using several Claude Code sessions at once without them colliding.
Read together with docs/SPEC.md, docs/ACCEPTANCE.md and docs/PROMPTS.md.

## What "MVP running" means

A presenter opens `/`, opens the four role windows, presses Reset and Seed, and runs this loop with `MOCK_AI=1`
and typed input (no live speech):

1. Patient checks in and gets an ID (A-###). A card appears on the nurse board.
2. Nurse calls for triage and completes triage with a priority. The card moves to Triaged.
3. Doctor sees the patient in Ready to be seen with an AI summary and presses Consult now.
4. Nurse sees an escort request and presses Patient is with the doctor. The card moves to Doctor Consultation.
5. Doctor starts the session and types lines. A rule check and the Interpreter window gate each line. The patient sees a line only after it is verified.
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
2. `/` onboarding page with four cards (Patient, Nurse, Doctor, Interpreter) opening their routes in new windows. Empty placeholder pages for each route.
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
| interpreter | `worktree-interpreter` | 3001 | `./care-loop-interp.db` | `app/interpreter/**`, `components/interpreter/**`, `lib/rules/safety/**`, `lib/pipeline/**`, `app/api/interpreter/**` |
| patient | `worktree-patient` | 3002 | `./care-loop-patient.db` | `app/patient/**`, `components/patient/**`, `app/api/checkin/**`, `app/api/enquiries/route.ts` (create), `data/phrases.json` |
| nurse | `worktree-nurse` | 3003 | `./care-loop-nurse.db` | `app/nurse/**`, `components/nurse/**`, `lib/rules/enquiry/**`, call-triage, triage, escorted, tests and enquiry handle or priority routes |
| doctor | `worktree-doctor` | 3004 | `./care-loop-doctor.db` | `app/doctor/**`, `components/doctor/**`, `lib/agents/**`, consult-now, session start and complete, decision and pack routes |

Shared files (only the Stage 0 session may change them): `lib/state/**`, `lib/contracts/**`, `lib/ui/**`, `lib/privacy/**`,
`lib/ai.ts`, `data/config*.json`, `app/layout.tsx`, `app/page.tsx`, `app/demo/**`, `docs/CONTRACT.md`.

### Setting up each worktree
Desktop app: start a new session in the repo with the worktree checkbox ticked. CLI: `claude --worktree interpreter`.
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

### Interpreter worktree prompt

```
[rules block]
Goal: the safety pipeline and the Interpreter window.
Build: lib/rules/safety (extract numbers with units, drug names from data/drugs.json, negations, allergy words and times from the source and the back-translation, and compare them), lib/pipeline (Translator with MOCK_AI, back-translation, retry up to 2 then hold, tier routing routine / verify / hold from config), the /interpreter screen (queue with hold first, source / translation / back-translation side by side, safety items ticked or flagged, Verify, Edit, Send back, extra typed confirmation for consent-type messages), and the interpreter API routes. Wire messages so a patient only ever sees verified content.
Tests first: planted-error cases (dose changed, "not" dropped, drug swapped, time shifted, unit changed, extra number).
Acceptance: F1, F2, F3, F4.
```

### Patient worktree prompt

```
[rules block]
Goal: the phone-width Patient screens.
Build: check-in (language, name, consent to contact, automated-assistant notice, reason for visit) that issues the ID, "Your ID: A-###" always visible, language switch and large-text toggle, the status feed using pre-approved phrases from data/phrases.json (placeholders marked TODO(clinician)), the enquiry box open only in the waiting-area states, "I feel worse" showing the fixed urgent wording from config and alerting the nurse, the escort alert with an "I am here" tap, the in-session view showing verified messages only (pending shows "Your interpreter is checking this"), and the results pack view with a follow-up button after release.
Acceptance: B1, B3, B4, B5, D7, D8, F6, G2, G4, I3.
```

### Nurse worktree prompt

```
[rules block]
Goal: the Nurse board. Match docs/design/nurse-board.dc.html for layout, copy and styles.
Build: the seven-column Kanban with live polling, cards (ID, initials or names via toggle, language, priority, status, time in stage, chips), the escort strip with "Patient is with the doctor" and "Can't find patient", the enquiries inbox on the far right with All / Urgent / High / Routine tabs, and the triage actions (Call for triage, Complete triage with priority and note, update test states, Move to Awaiting Decision).
Enquiry triage as pure functions in lib/rules/enquiry with tests: red-flag phrases always Urgent, category to tier from config, time bump, AI can only raise, low confidence goes to "Needs nurse review", nurse override, canned stage answers.
Acceptance: C1, C2, C6, C9, D1 to D6, D9, I2, I4.
```

### Doctor worktree prompt

```
[rules block]
Goal: the Doctor board. Match docs/design/doctor-board.dc.html for layout, copy and styles.
Build: Ready to be seen (sorted by priority then wait, AI summary via MOCK_AI, profile panel, Consult now), the session frame (Patient ID, Doctor ID, Session no., waiting state with Start session disabled until the nurse confirms, transcription consent check), typed capture of lines into the conversation panel (live speech is Stage 3), a draft note via MOCK_AI into the template sections with a rule check that flags note content not in the transcript, tests to order, Complete (send for tests or to decision), the decision (Discharge or Admit, doctor only), and the results pack draft and release.
Acceptance: C3, C4, C5, C7, C8, C10, E1 to E4, E6, E7, E8, G1, G3, G5.
```

---

## Merge order and Stage 2

Merge into main one branch at a time, in this order: interpreter, patient, nurse, doctor. After each merge run `npm test` and
`npm run build`. Expect conflicts only where someone edited a shared file; those are listed under SHARED CHANGES.

Stage 2 prompt (main checkout, one session):

```
Read CLAUDE.md, docs/ACCEPTANCE.md and the rehearsal script. All four branches are merged.
Goal: make the MVP loop in docs/PARALLEL_PLAN.md run end to end.
1. Write a Playwright test that runs the rehearsal script across four separate browser contexts (patient, nurse, doctor, interpreter), then run it.
2. Fix every seam it exposes (state updates not showing across windows, wrong transitions, placeholder data).
3. Confirm A3 (MOCK_AI works with Wi-Fi off), A4 (updates appear within 3 seconds), and run the full suite.
Report ACCEPTANCE A and C items with evidence.
```

## Stage 3: stretch (two worktrees, only after the MVP loop passes)

- **speech:** live speech with the browser speech API and the typed fallback, plus a real AI provider behind lib/ai.ts. Acceptance E5, E6.
- **polish:** audit page with the breach toggle, accessibility pass (I1 to I3), the results pack translation with pre-verified phrases, the demo narrative.

## If you only want three sessions
Merge the interpreter work into the doctor session, but keep the safety checker tests first. Do not merge patient and nurse
together: they are the two screens judges look at most.

## Risks
- Parallel sessions can drift from the contract. Keep Stage 0 strict and re-read docs/CONTRACT.md at the start of each session.
- Stubs that pass tests can still hide missing behaviour. Stage 2's end-to-end test is the real proof.
- Demo defaults (long wait, bump, red-flag demo list) are NOT clinical values. Label them as demo-only until a clinician replaces them.
- Reviewing four diffs takes real time. Review each branch before merging, especially the interpreter and patient-visibility code.
