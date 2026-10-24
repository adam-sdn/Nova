# Prompts for Claude Code

How to use: start `claude` in the repo root. CLAUDE.md loads automatically. For each milestone, press
Shift+Tab to enter plan mode, paste the prompt, review the plan, then approve it. One milestone per session.
Use `/clear` between milestones. Commit after each one.

## The pattern

```
Read CLAUDE.md and section [x] of docs/SPEC.md.
Goal: [one sentence].
Write failing tests first for: [list].
Then implement. Do not start the next milestone and do not add dependencies without asking.
Finish by running the tests and report each acceptance item for this milestone as PASS or FAIL with evidence.
```

## M0: scaffold

```
Read CLAUDE.md and docs/SPEC.md sections 3, 13, 15.
Goal: scaffold the project and the onboarding page.
- Create a Next.js (App Router) + TypeScript strict + Tailwind app in this folder, keeping the existing files.
- Add better-sqlite3, zod, vitest and playwright. Propose anything else before adding it.
- lib/privacy already exists: import it via an alias and make `npx tsx lib/privacy/selftest.ts` run as an npm script.
- Build `/` with four cards (Patient, Nurse, Doctor, Interpreter) that open their routes in new windows, and empty placeholder pages for each route.
- Create lib/ai.ts with a MOCK_AI mode that returns fixtures, and a seed script with synthetic visits in every column.
- Update the Commands section of CLAUDE.md with the real commands.
Acceptance: A1, A2 (basic), A5.
```

## M1: state and status machine

```
Read CLAUDE.md and SPEC sections 4, 5, 10, 11, 12.
Goal: the shared record, the seven-column status machine with guards, the audit log, and GET /api/state with polling.
Write failing tests first for every transition in section 5 (legal and illegal), ID generation (B2), and audit entries.
Do not build any screens beyond a read-only list.
Acceptance: B2, C5, C10, C11, C12, C13, H4, H5.
```

## M2: patient check-in and status

```
Read CLAUDE.md and SPEC sections 5 (T1, T2), 6 (Patient), 8.
Goal: patient check-in, ID issue, the status feed with pre-approved phrases, the enquiry box, and "I feel worse".
Implement getPatientVisibleContent() and test it over every status. Use placeholder phrases marked TODO(clinician).
Acceptance: B1, B3, B4, B5, D7, D8, F5, F6.
```

## M3: nurse board and enquiry triage

```
Read CLAUDE.md and SPEC sections 4, 6 (Nurse), 7, 8.
Goal: the Kanban board, triage actions, the escort strip, and the enquiries inbox with the AI triage agent.
Rules live in lib/rules as pure functions with unit tests: red flags, tier table, time bump, raise-only, low confidence.
Match the layout and tokens in SPEC sections 6 and 13.
Acceptance: C1, C2, D1 to D6, D9, I2, I4.
```

## M4: doctor queue and session frame

```
Read CLAUDE.md and SPEC sections 5 (T3 to T6), 6 (Doctor).
Goal: the Ready to be seen queue with AI summaries, the profile panel, Consult now, the escort flow, and the session frame (waiting and start).
Acceptance: C3, C4, C5, C6, C7, E1, E2, E3, E4.
```

## M5: live speech, notes, tests

```
Read CLAUDE.md and SPEC sections 5 (T7 to T9), 6 (Doctor), 7, 9.
Goal: capture speech with the browser speech API and a typed fallback, show the transcript, draft the note into the template,
let the doctor edit and sign, order tests, and Complete.
Add the rule check that flags note content not found in the transcript (E8).
Acceptance: C8, E5, E6, E7, E8.
```

## M6: decision, results pack, interpreter

```
Read CLAUDE.md and SPEC sections 5 (T10 to T13), 6 (Interpreter), 9.
Goal: Awaiting Decision, the doctor's decision, the results pack, release, the follow-up button, and the interpreter window.
Write failing tests first for the Safety Checker with the planted-error cases in ACCEPTANCE F1.
Acceptance: C9, F1 to F4, G1 to G5.
```

## M7: polish and smoke test

```
Read CLAUDE.md, docs/ACCEPTANCE.md and the rehearsal script.
Goal: write a Playwright test that runs the full rehearsal script across separate browser windows (patient, nurse,
doctor, interpreter), run it, fix what fails, then fix accessibility items I1 to I4.
```

## Final audit (fresh session)

```
Read docs/ACCEPTANCE.md. For every item, run or inspect what is needed and report PASS or FAIL with evidence.
Fix every FAIL. Never mark PASS without evidence. Then run the full test suite and the smoke test and show the output.
```

## Review prompt (fresh session, after each big milestone)

```
Review the diff of the last milestone as a skeptical senior engineer. Look for: places where AI output can reach a patient
unverified, places that could lower an enquiry priority, plaintext sensitive data in logs or the database, invented clinical
content, and missing tests. List problems by severity. Do not change code yet.
```
