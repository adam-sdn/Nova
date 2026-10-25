# Care Loop: product spec (v1)

Working title. Do not reuse the name "Lodestar" (another project).
Hackathon constraints: AI in Healthcare, teams of four, public or synthetic data only,
submission Sunday 11:30, 4-minute pitch plus 2-minute Q&A.
Judged on: creativity and innovation, technical sophistication, impact (real, safe, feasible), design and UX.

## 1. What we are building

Patients arrive at an emergency department, check in on their own phone, and are tracked by a system ID
(A-102) so similar names never cause confusion. Their progress moves a card across a seven-column board that
nurses see live. Doctors see who is ready to be seen, with an AI summary, and bring patients in through a
session frame. During the consultation, speech is turned into a draft note in the doctor's template. Patients
can send enquiries any time they are in the waiting area, and an AI agent flags urgent ones for the nurse.
At the end, an AI-prepared results pack (results, the doctor's advice, any medicines the doctor listed) is
released by the doctor and delivered in the patient's language, with a follow-up option.

Every AI step has a human gate. A doctor's message reaches the patient only after it passes independent model
and rule checks and the doctor confirms it against a back-translation; high-risk content is held and escalated to
the hospital's interpreter service outside the app.

## 2. Scope

In scope: onboarding page, four role windows, the seven-column flow, enquiries with AI triage, doctor queue
and session frame, live speech with typed fallback, draft notes, tests on cards, results pack, privacy
helpers, audit log, demo controls.

Out of scope for now: the follow-up loop beyond a button, Gmail or Calendar integration, real hospital
integration, real phone calls or SMS, dialect handling, trained ML models.

## 3. Roles and windows

| Route | Who | Device | Purpose |
|---|---|---|---|
| `/` | Presenter | Laptop | Onboarding: three cards that open each role in its own window |
| `/patient` | Patient | Phone-width window | Check-in, status, enquiries, escort alert, session view, results pack |
| `/nurse` | Nurse | Wide screen (1700px or more designed) | Kanban board, escort requests, enquiries inbox |
| `/doctor` | Doctor | Laptop or tablet | Ready-to-be-seen queue, session frame, notes, tests, decision |
| `/demo` | Presenter | Any | Reset, seed, simulate arrivals, toggle MOCK_AI |

All windows read and write one server-side record and poll every 1 to 2 seconds.

## 4. The seven columns

| # | Column | Meaning |
|---|---|---|
| 1 | To Do (Arrival) | Patient has walked in and is checking in |
| 2 | Triage Waiting | Registered, in the waiting area, queued for the triage nurse |
| 3 | Triaged (Awaiting Doctor) | Vitals taken, priority assigned, waiting to be allocated to a doctor |
| 4 | Diagnostics In Progress | Having blood tests, X-rays or CT, or waiting in the lounge for results |
| 5 | Doctor Consultation | In a cubicle being examined and treated by the doctor |
| 6 | Awaiting Decision | All results back, team reviewing the file to decide next steps |
| 7 | Done (Discharged/Admitted) | Leaves the active board after [time]; stays in the audit log |

Cards can move backward (for example Awaiting Decision back to Diagnostics when more tests are ordered, or a
second consultation). Each card shows: ID, initials (names via toggle), language, nurse-set priority,
status text, time in stage, and chips (Long wait, Escort requested, Notes capturing, Urgent enquiry or
Enquiry). Consultation cards show "with Dr X", doctor ID and session number. Diagnostics cards list each test
and its state.

## 5. Transitions

| # | Trigger (actor) | From to | Guard | Side effects |
|---|---|---|---|---|
| T1 | Patient scans QR, enters name, language, consent | none to To Do | Consent to contact and the AI notice accepted | System issues ID `A-###`; card on nurse board; phone shows "Your ID: A-102" |
| T2 | Registration submitted (automatic; nurse can correct) | To Do to Triage Waiting | Form complete | Phone shows first status message |
| T3 | Nurse `Call for triage` | stays in Triage Waiting | Not claimed by another nurse | Phone alert "Please come to the triage desk"; card tag "Being triaged" |
| T4 | Nurse `Complete triage` (priority + note) | Triage Waiting to Triaged | Priority required | AI summary generated; appears in doctor's Ready queue; phone status updates |
| T5 | Doctor `Consult now` | stays in Triaged | Patient not claimed by another doctor | Creates Session (state `waiting`); escort request on nurse board; phone "A nurse is coming. Tap if you are here."; card chip "Escort requested" |
| T6 | Nurse `Patient is with the doctor` | Triaged to Doctor Consultation | Active escort request | Session state `ready`; doctor's Start session enabled; phone shows the session view. `Can't find patient` flags the nurse board and returns the patient to the queue |
| T7 | Doctor `Start session` | stays in Consultation | Patient informed and agreed to transcription | Session `in_session`; capture starts; chip "Notes capturing" |
| T8 | Doctor `Complete · send for tests` | Consultation to Diagnostics | Note signed, at least one test | Tests created; phone status "You are having tests" |
| T9 | Doctor `Complete · to decision` | Consultation to Awaiting Decision | Note signed | Phone status updates |
| T10 | Nurse or lab updates a test state; all results back | stays in Diagnostics | none | Badge "Results back"; nurse or doctor may `Move to Awaiting Decision` |
| T11 | Doctor `Record decision` (Discharge or Admit) | Awaiting Decision to Done | Doctor only | AI drafts the results pack; phone shows "Your doctor is preparing your summary" |
| T12 | Doctor `Release pack` | stays in Done | Doctor only; the pack translation passed the translation agent's checks and the doctor confirmed it | Phone shows the results pack and a follow-up button; enquiry box replaced |
| T13 | Doctor `Order more tests` or `Second look` | Awaiting Decision to Diagnostics, or a new session | Doctor only | Session number increments |
| T14 | Retention timer | Done off the active board | Config `doneRetentionMinutes` | Audit log keeps everything |

Enquiries are open on the phone in Triage Waiting, Triaged, Diagnostics and Awaiting Decision. They are closed
during Doctor Consultation (the patient is with the doctor) and after Done (the follow-up button replaces them).

## 6. Screens

### Onboarding `/`
Three cards (Patient, Nurse, Doctor), each opening its route in a new window. A "Demo controls"
link. A "Demo data" tag.

### Patient `/patient` (phone-width)
- Check-in: language, name, consent to contact, a notice that they are talking to an automated assistant, reason for visit (free text, any language).
- Always visible: "Your ID: A-102", language switch, large-text toggle, an "I feel worse" button, the enquiry box.
- Status feed in their language using pre-verified phrases. No wait numbers; at most a labelled range.
- "I feel worse" shows fixed urgent wording (from config) and alerts the nurse at once.
- Escort alert: "A nurse is coming" with a "I am here" tap.
- In session: delivered messages only (passed every check, then confirmed by the doctor's Send). A pending message shows "Your message is being checked". Held or escalated messages are never shown.
- Outcome: after the doctor releases it, the results pack and a follow-up button.

### Nurse `/nurse`
- Kanban with the seven columns (Done column compact). Counts per column.
- Escort requests strip above the board: ID, language, "Called by Dr Okafor (D-05) · Cubicle 4 · requested 2m ago", buttons `Can't find patient` and `Patient is with the doctor`.
- Enquiries inbox on the far right, sorted by suggested priority, tabs All / Urgent / High / Routine with counts. Each item: ID, priority chip, category, time waited, the patient's words (with "Translated from Arabic" when relevant), an "AI suggestion" line, buttons `Open card` and `Mark handled`.
- "Show names" toggle (off by default) and "Reset demo".
- Card actions: Call for triage, Complete triage (priority, note), update test states, Move to Awaiting Decision.

### Doctor `/doctor`
- "Ready to be seen": triaged patients sorted by nurse priority, then longest wait. Each row: ID, priority, initials, language, Interpreter needed, wait time, Long wait, enquiry chip, an "AI summary", buttons `View profile` and `Consult now`.
- Profile panel: reason for visit in the patient's words, the AI summary (labelled, with key points), the triage record (vitals entered by the nurse; placeholders until entered), a `Consult now` button.
- Session frame, header with Patient ID, Doctor ID, Session no. Waiting state: stepper (Called, Nurse notified, Patient escorted, In session), "Waiting for the patient", `Start session` disabled until the nurse confirms, `Return to queue`.
- In session: "Notes capturing" indicator; Conversation panel with one message card per line:
  - Doctor lines: a status chip (Checking, Ready to send, Held, Escalated, Delivered); a box "The patient will read: <back-translation>"; a checks panel (rule checks: numbers with units, drug names, negations, allergy words, times; AI verifier: error list by type and severity); a collapsible "Agent trace" (each step, model family, retry count, result); buttons `Send`, `Edit and recheck`, `Escalate`. `Send` is enabled only when every check passes. A held or escalated line shows "Use the hospital interpreter service" and a `Handled with interpreter service` button (records an attestation with a reason).
  - Patient lines: the AI translation with the original beside it and a chip "AI-checked" or "Needs checking". No gate. A "Needs checking" line prompts the doctor to ask a clarifying question.
- Draft note panel (template sections, each AI line marked "AI draft · from conversation lines x to y", editable); Tests to order; buttons `Complete · send for tests` and `Complete · to decision`.
- After completing: back to the queue with a notice saying where the card moved.

### Demo `/demo`
Reset, Seed (synthetic patients across all columns), simulate a new arrival, toggle MOCK_AI, advance a test state.

## 7. AI agents

| Agent | Input | Output | Human gate | Notes |
|---|---|---|---|---|
| Intake translator | Free-text reason in any language | English text, original kept | Nurse confirms at triage | Shows original beside it |
| Enquiry triage | Patient message, time waited, nurse priority | Category, suggested tier, one-line reason | Nurse confirms or overrides | Rules first; AI raises only |
| Patient summary | Triage note, intake, enquiries | Short labelled summary and key points | Doctor reads | Summarises only; never assesses |
| Consult scribe | Transcript | Draft note in the template | Doctor edits and signs | Rule check flags any number, unit or drug name in the note that is not in the transcript |
| Orders extractor | Signed note | Suggested tests | Doctor confirms | Optional; cut first |
| Translation agent | Doctor message (or patient line) | Translation, back-translation, rule-check result, AI verifier result, retries, agent trace | Doctor reads the back-translation and the checks, then taps Send; held lines go to the hospital interpreter service outside the app | See section 9. Translator, back-translator and AI verifier are three different model families |
| AI verifier | Source, translation and back-translation | Structured error list (accuracy, omission, addition, negation, terminology), each with a severity | Feeds the agent's decision; the doctor sees it in the checks panel | A third model family, independent of the translator and back-translator |
| Outcome pack | Results, doctor advice, medicines the doctor listed | Plain-language pack in the patient's language | Doctor releases; translation passes checks and the doctor confirms | Relays only what was entered; adds nothing |

Not AI (plain rules): queue ordering, escort ping, timers, status machine, ID generation.

## 8. Enquiry triage logic

1. Red-flag rules first: a clinician-defined phrase list (`TODO(clinician)`: breathing, chest pain, fainting, bleeding, and so on) always gives Urgent and notifies the nurse. No AI needed.
2. AI classifies the message into a category (breathing, pain, dizziness, bleeding, comfort, question, other) with a confidence score.
3. Category gives a base tier from a clinician-defined table (`TODO(clinician)`).
4. Time waited moves the tier up one level after a clinician-set threshold (`TODO(clinician)`).
5. The AI can only raise a tier. Low confidence goes to "Needs nurse review". The nurse can override any tier.
6. Stage or wait-time questions get a canned answer (stage plus a range, never exact times) and are marked handled automatically.
7. Every suggestion, override and handling is logged.

Placeholder weights are fine for the demo. Calibrate later against labelled vignettes or datasets and report
over- and under-flagging honestly.

## 9. Translation agent (doctor and patient lines in a session)

There is no interpreter role or window. Translation is an agentic system: AI translation, independent model and
rule checks, and the doctor's confirmation. High-risk content is held and escalated to the hospital's interpreter
service outside the app. No third person joins the conversation inside the app.

### Doctor-to-patient messages

States: `drafted` then `checked` then `ready_for_doctor` (every check passed) or `flagged` (a check failed, retries
left) or `held`; from `ready_for_doctor` the doctor's Send gives `delivered`; Escalate gives `escalated` (still held).
Edit and recheck returns a message to `drafted`.

1. **Translator** (TranslateGemma) produces the translation.
2. **Back-translator** (a different model family) translates it back to English.
3. **Rule checker** (pure functions in `lib/rules/safety`): extract numbers with units, drug names (from
   `data/drugs.json`), negations (not, no, never, do not, avoid, stop), allergy words and times from the source
   English, then compare with the back-translation. Any mismatch fails.
4. **AI verifier** (a third model family): compares source, translation and back-translation and returns a structured
   error list. Each error has a type (accuracy, omission, addition, negation, terminology) and a severity.
5. **Agent decision:** if any check fails, the Translator retries, up to `maxRetries` (2), with the verifier's
   feedback (for example "preserve numbers verbatim"). Still failing: the message is `held`.
6. **Doctor confirmation:** the doctor sees "The patient will read: <back-translation>" with the checks and taps
   `Send`. Every doctor-to-patient message needs the doctor's Send. Only pre-approved system phrases (stage updates,
   escort alerts, outcome boilerplate) deliver without it, because a fluent speaker verified them ahead of time in
   `data/phrases.json`.
7. **Agent trace:** a collapsible trace per message shows each step, the model family used, the retry count and the result.

### Held messages and escalation

- Held messages are never delivered. A message is held when: any check still fails after the retries; it is a
  consent-type message; the patient's language is listed in `weakLanguages`; or the doctor chooses Escalate.
- **Escalate:** the message stays held; the doctor sees "Use the hospital interpreter service"; the patient's card on
  the nurse board gets an "Interpreter needed" chip so a nurse can arrange the service outside the app; an audit
  entry is written. The doctor can also `Edit and recheck`, or mark `Handled with interpreter service` (a recorded
  attestation with a reason).
- **Consent:** consent-type messages are never delivered by the app. Consent is handled with the interpreter service
  outside the app, and the doctor records an attestation.

### Patient-to-doctor lines

The AI translation is shown to the doctor with the original beside it and a chip "AI-checked" or "Needs checking".
There is no gate. A flagged line prompts the doctor to ask a clarifying question.

### Config (`data/config.json`, `translation` block)

`translator`, `backTranslator`, `aiVerifier` (model and family for each; the app validates that the three families
differ), `consentRequiresInterpreter: true`, `weakLanguages` (`TODO(clinician)`), `maxRetries: 2`.

### Invariant and claim

`getPatientVisibleContent()` returns only messages in state `delivered`, pre-approved phrases and released packs.
Never `drafted`, `checked`, `ready_for_doctor`, `flagged`, `held` or `escalated`.

Claim to use: "AI-translated, checked by independent models and rules, and confirmed by the doctor against a
back-translation. High-risk content is held and escalated to the hospital's interpreter service outside the app."
Never claim "AI-verified, therefore safe".

## 10. Data model (SQLite; sensitive fields encrypted)

- `visits`: id, display_id (`A-102`), token, name_enc, language, status, priority, stage_changed_at, created_at, consent_contact, consent_transcribe
- `sessions`: id, visit_id, doctor_id, number, state (`waiting`, `ready`, `in_session`, `ended`), started_at, ended_at
- `messages`: id, session_id, direction, source_enc, translation_enc, back_translation_enc, status (`drafted`, `checked`, `ready_for_doctor`, `flagged`, `held`, `escalated`, `delivered`), safety_json (rule checks), ai_checks_json (AI verifier error list), trace_json (agent trace: steps, model families, retries, results), confirmed_by, confirmed_at, escalated_at, edits_json
- `attestations`: id, message_id, session_id, doctor_id, kind (`handled_with_interpreter_service`, `consent_via_interpreter_service`), reason_enc, created_at
- `enquiries`: id, visit_id, text_enc, original_lang, category, tier, ai_reason, status, handled_by, created_at
- `tests`: id, visit_id, name, state (`ordered`, `in_progress`, `done`, `results_back`)
- `notes`: id, session_id, template_json_enc, transcript_enc, signed_by, signed_at
- `packs`: id, visit_id, content_enc, language, status (`draft`, `verified`, `released`), released_by
- `doctors`: id (`D-05`), name, cubicle
- `audit`: seq, ts, actor, action, ref_id, detail_hash, prev_hash, hash

IDs: `A-###`, a letter prefix per day or shift, zero-padded, unique, never reused the same day, and containing
no personal information. Session number is the nth consultation for that visit.

## 11. API (JSON, zod-validated)

- `GET /api/state?role=nurse|doctor|patient&id=...` the live view for polling
- `POST /api/checkin`, `POST /api/visits/:id/call-triage`, `POST /api/visits/:id/triage`
- `POST /api/visits/:id/consult-now`, `POST /api/sessions/:id/escorted`, `POST /api/sessions/:id/start`, `POST /api/sessions/:id/complete`
- `POST /api/visits/:id/tests/:testId`, `POST /api/visits/:id/decision`, `POST /api/visits/:id/pack/release`
- `POST /api/enquiries`, `POST /api/enquiries/:id/handle`, `POST /api/enquiries/:id/priority`
- `POST /api/sessions/:id/messages` (runs the translation agent), and under `/api/sessions/:id/messages/:msgId/`: `send` (the doctor's Send), `recheck` (after an edit), `escalate`, `attest` (Handled with interpreter service, with a reason)
- `POST /api/demo/reset`, `POST /api/demo/seed`

Every state-changing route checks the transition guard (section 5), writes an audit entry, and returns the new state.

## 12. Privacy and audit

Use `lib/privacy` (tested): `encryptField` for names, enquiry text, transcripts, notes, packs; `pseudonymise`
before any AI call and `restore` afterwards; `appendAudit` for every transition, flag, verification, release
and decryption. No third person joins the conversation inside the app: the hospital interpreter service, when
needed, is arranged outside it. No raw audio is stored. Honest claims only: encrypted at rest with keys held outside the
database, identifiers removed before AI calls, tamper-evident log. Not zero-knowledge. Chrome's speech
recognition sends audio to Google's servers, so say "we do not store audio", not "audio never leaves the device".

## 13. Design tokens (from the approved mockups)

- Fonts: IBM Plex Sans (UI), IBM Plex Mono (IDs, session numbers).
- Ground `#F3F5F4`, surface `#FFFFFF`, ink `#14201F`, muted `#4A5A58`, border `#CBD5D2`, column fill `#E6ECEA`.
- Accent teal `#0B6B66` (primary buttons, selection); teal tint `#D9EFED` with text `#0B4F4B` (notes, escort, verified).
- Urgent chip: text `#8A2B0E`, fill `#FDE7DD`, border `#E9AE96`, triangle icon. High and Long wait: text `#6B4A00`, fill `#FFF1CC`, border `#E8C873`. Routine: text `#2F3E3C`, fill `#E6ECEA`. Demo tag: text `#17406E`, fill `#E4EEF9`.
- Cards: white, 1px border, radius 10px. Columns: radius 12px. Buttons: radius 8px, minimum height 44px.
- Never rely on colour alone: each chip has a label, and urgent has an icon.

## 14. Config and placeholders that need a human

Put all of these in `data/config.json` and mark each `TODO(clinician)` until a clinician fills it:
stage wording; priority scale; red-flag phrase list; category-to-tier table; wait thresholds and the Long wait
threshold; fixed urgent wording; the note template sections; the test catalogue; results-pack template and
"when to seek help" wording; `doneRetentionMinutes`. Languages: choose one or two. A fluent speaker verifies
`data/phrases.json` ahead of time.

## 15. Milestones

M0 scaffold, onboarding page, seed, MOCK_AI, privacy folder wired in.
M1 shared state, the status machine with guards, audit log, polling.
M2 patient check-in (ID issue), status feed, enquiry box, "I feel worse".
M3 nurse board: triage actions, escort strip, enquiries inbox with the AI triage agent.
M4 doctor board: Ready queue with AI summary, Consult now, session frame (waiting, start).
M5 live speech with typed fallback, draft note, tests ordered, Complete.
M6 Awaiting Decision, decision, results pack, release, follow-up button; the translation agent (translator, back-translator, rule checker, AI verifier, retries, doctor Send, escalation), also applied to the pack.
M7 polish, accessibility, smoke test of the full demo script, rehearsal.

## 16. Cut line

Must have: M0 to M4, M5 with typed input, M6 with mock AI. Cut in this order if time slips: orders extractor,
translation-agent checks for the results pack (use pre-approved phrases from `data/phrases.json`), live speech
(keep typed input),
encryption toggle on the audit page, patient-side large-text toggle.

## 17. Decisions log and open questions

Decided (change here first, then tell Claude Code to re-read this file):

- Three windows (Patient, Nurse, Doctor). There is no interpreter role, window, route or onboarding card.
- Translation is an agentic system: Translator (TranslateGemma), Back-translator and AI verifier from three different
  model families, plus a rule checker. Failed checks retry up to 2 times with the verifier's feedback, then hold.
- Every doctor-to-patient message needs the doctor's Send, after the doctor reads "The patient will read:
  <back-translation>" and the checks. Only pre-approved phrases in `data/phrases.json` deliver without it.
- Held messages are never delivered. Escalate keeps the message held, tells the doctor to use the hospital
  interpreter service, puts an "Interpreter needed" chip on the nurse board card, and writes an audit entry.
  `Handled with interpreter service` is a recorded attestation with a reason.
- Consent-type messages are never delivered by the app (`consentRequiresInterpreter: true`); consent goes through the
  interpreter service outside the app and the doctor records an attestation.
- Patient-to-doctor lines are AI-translated with the original shown and an "AI-checked" or "Needs checking" chip; no gate.
- Claim: "AI-translated, checked by independent models and rules, and confirmed by the doctor against a
  back-translation. High-risk content is held and escalated to the hospital's interpreter service outside the app."
  Never "AI-verified, therefore safe".
- Registration moves To Do to Triage Waiting automatically on check-in submission. Open: a reception step may be needed.
- Only a doctor records the decision that moves a card to Done. A nurse may move cards between Diagnostics and Awaiting Decision.
- Enquiries are closed during Doctor Consultation and replaced by the follow-up button after Done.
- Cards may move backward (more tests, second session).
- The AI never lowers an enquiry priority and never sets triage priority.
- Gmail and Calendar integration, real calls or SMS, and the full follow-up loop are out of scope for this build.
- A teach-back check (patient answers 2 to 3 questions in their language) was discussed as an optional extra. Not in scope unless time allows.

Still open (a human must decide):

- Which one or two languages the demo supports, and who verifies them.
- The clinician-defined items listed in section 14.
- Whether to show a labelled wait range to patients, or hide it.
- Hosting: the demo runs locally. Any deployment needs a hosted database.
