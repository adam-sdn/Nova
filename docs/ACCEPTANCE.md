# Acceptance checklist (definition of done)

Mark an item PASS only with evidence: a passing test name, a command output, or a rehearsed demo step.
"Test" means an automated test. "Demo" means a manual step in the rehearsal script.

## A. Setup and demo mechanics

| ID | Item | How verified |
|---|---|---|
| A1 | `/` shows Patient, Nurse, Doctor and Interpreter cards that open each route in a new window | Demo |
| A2 | `/demo` Reset and Seed give the same starting board every time (patients in all columns) | Test |
| A3 | `MOCK_AI=1` runs the whole flow with no network (browser speech aside) | Demo with Wi-Fi off |
| A4 | A state change in one window shows in the others within 3 seconds | E2E test |
| A5 | `npm test`, `npm run test:e2e` and `npm run build` all pass | Commands |

## B. Check-in and IDs

| ID | Item | How verified |
|---|---|---|
| B1 | Check-in with name, language and consent creates a card in To Do (Arrival) and shows "Your ID: A-###" on the phone | E2E test |
| B2 | IDs are unique, sequential, never reused the same day, and contain no personal data | Unit test |
| B3 | Two patients with the same initials stay distinguishable by ID | Demo |
| B4 | Staff boards hide names by default; "Show names" reveals them | Demo |
| B5 | Check-in cannot complete without consent to contact | Unit test |

## C. Flow and handoffs

| ID | Item | How verified |
|---|---|---|
| C1 | Registration moves To Do to Triage Waiting | E2E test |
| C2 | Nurse Call for triage alerts the phone; Complete triage requires a priority and moves to Triaged | E2E test |
| C3 | Triaged patients appear in the doctor's Ready queue sorted by priority, then wait | Unit test |
| C4 | Consult now creates a session and an escort request on the nurse board, and alerts the phone | E2E test |
| C5 | Two doctors cannot claim the same patient | Unit test |
| C6 | Patient is with the doctor moves the card to Doctor Consultation and enables Start session; Can't find patient flags and returns the patient to the queue | E2E test |
| C7 | The session frame shows Patient ID, Doctor ID and Session no.; the nurse card shows "with Dr X" with the same IDs | Demo |
| C8 | Complete · send for tests moves to Diagnostics with each test listed; Complete · to decision moves to Awaiting Decision; both need a signed note | E2E test |
| C9 | Test states update on the card; when all results are back a "Results back" badge appears | E2E test |
| C10 | Only a doctor can record a decision; Done needs a decision | Unit test |
| C11 | Cards can move backward (more tests, second session); session number increments | Unit test |
| C12 | Done cards leave the active board after `doneRetentionMinutes` but stay in the audit log | Unit test |
| C13 | Every illegal transition is rejected with a clear error | Unit test |

## D. Enquiries and AI triage

| ID | Item | How verified |
|---|---|---|
| D1 | A patient enquiry appears in the nurse inbox with a suggested priority and a one-line reason | E2E test |
| D2 | A red-flag phrase always gives Urgent, with no AI call needed | Unit test |
| D3 | The AI can raise a tier but never lower one | Unit test |
| D4 | Waiting past the threshold raises the tier by one level | Unit test |
| D5 | Low confidence goes to "Needs nurse review" | Unit test |
| D6 | The nurse can override a tier; Mark handled removes the item; both are audited | E2E test |
| D7 | "I feel worse" shows the fixed urgent wording and alerts the nurse immediately | E2E test |
| D8 | Enquiries are open in the waiting-area states, closed in Consultation and after Done | Unit test |
| D9 | Stage or wait questions get a canned answer with a range, never an exact time | Unit test |

## E. Doctor board, session and notes

| ID | Item | How verified |
|---|---|---|
| E1 | Ready queue rows show the AI summary labelled as an AI summary | Demo |
| E2 | The profile panel shows the reason in the patient's words, the translation note, the triage record and the summary | Demo |
| E3 | Start session is disabled until the nurse confirms arrival | E2E test |
| E4 | Starting a session requires the transcription consent check | Unit test |
| E5 | Speech (Chrome) or typed input produces transcript lines in the Conversation panel | Demo |
| E6 | A draft note fills the template sections; each AI line links to its conversation lines | Demo |
| E7 | The doctor can edit every note section; completing requires a signed note | E2E test |
| E8 | The rule check flags any number, unit or drug name in the note that is not in the transcript | Unit test |

## F. Interpreter pipeline and patient safety

| ID | Item | How verified |
|---|---|---|
| F1 | The Safety Checker fails when a number, unit, drug name, negation or time differs between the source and the back-translation | Unit test with planted errors: dose changed, "not" dropped, drug swapped, time shifted, unit changed, extra number |
| F2 | A failed check retries the translation at most twice, then holds the message | Unit test |
| F3 | Verify and hold tiers never reach the patient until the interpreter verifies | Unit and E2E test |
| F4 | Consent-type messages need the extra confirmation | E2E test |
| F5 | `getPatientVisibleContent()` never returns drafted, checked, awaiting, rejected or unreleased content | Unit test over every status |
| F6 | Pre-verified phrases carry verifier and date, and unverified phrases are never served | Unit test |

## G. Results pack and outcome

| ID | Item | How verified |
|---|---|---|
| G1 | The pack contains only results, the doctor's advice and medicines the doctor entered; the AI adds nothing | Unit test with a fixture |
| G2 | The patient sees "preparing your summary" until the doctor releases | E2E test |
| G3 | Release is doctor-only and requires verified translation | Unit test |
| G4 | After release the phone shows the pack in the patient's language and a follow-up button | Demo |
| G5 | "When to seek help" wording comes from fixed config, never from AI | Unit test |

## H. Privacy and audit

| ID | Item | How verified |
|---|---|---|
| H1 | Names, enquiry text, transcripts, notes and packs are stored encrypted | Unit test on stored rows |
| H2 | Text is pseudonymised before every AI call, and the AI adapter never receives identifiers | Unit test with a spy |
| H3 | No raw audio is stored | Code review |
| H4 | The audit chain verifies, and detects edits and deletions | Existing `lib/privacy/selftest.ts` |
| H5 | Audit entries exist for each transition, flag, verification, release and decryption, and contain hashes, not plaintext | Unit test |
| H6 | No UI copy claims "zero-knowledge" or any measured outcome | Search the codebase |

## I. Design and accessibility

| ID | Item | How verified |
|---|---|---|
| I1 | All controls are keyboard reachable with visible focus; touch targets are at least 44px | Manual |
| I2 | Status is conveyed by text and icon, not colour alone | Manual |
| I3 | The patient view works at phone width with large text on | Manual |
| I4 | "Demo data" appears on every staff screen | Demo |

## Rehearsal script (about 4 minutes)

1. Open `/`, then each role window. Reset and Seed.
2. Patient window: check in. Show the ID on the phone and the card in To Do on the nurse board.
3. Nurse: call for triage, complete triage, show the card in Triaged.
4. Patient: send an enquiry and press "I feel worse". Show the nurse inbox flag and the fixed urgent wording.
5. Doctor: open the profile and AI summary, press Consult now. Nurse: escort, press Patient is with the doctor.
6. Doctor: Start session. Type or speak a line with a dose and a "do not". Show the draft note.
7. Plant a wrong dose. Show the Safety Checker blocking it. Interpreter: verify. Patient sees it only now.
8. Doctor: Complete · send for tests. Nurse: update a test, results back, Awaiting Decision.
9. Doctor: record the decision and release the pack. Patient: show the pack, language and follow-up button.
10. Show the audit chain check.

Run it three times with a timer. Record a backup video of a clean run.

## Final audit prompt (run in a fresh session)

"Read docs/ACCEPTANCE.md. For every item, run or inspect what is needed and report PASS or FAIL with
evidence. Fix every FAIL. Never mark PASS without evidence. Then run the full test suite and the smoke test and
report the output."
