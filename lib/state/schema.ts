// SQLite schema (SPEC section 10). Columns ending in _enc hold an EncryptedField as JSON.
// Additions beyond SPEC are marked "guard" (needed by a section 5 guard) or "demo".
/** Bump when a table changes shape. Older local demo databases are rebuilt (synthetic data only). */
export const SCHEMA_VERSION = 4;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL,
  day TEXT NOT NULL,                       -- guard: IDs are unique per day
  token TEXT NOT NULL UNIQUE,
  name_enc TEXT NOT NULL,
  initials_enc TEXT NOT NULL,
  reason_enc TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER,
  triage_note_enc TEXT,
  triage_claimed_by TEXT,                  -- guard: T3 one nurse at a time
  escort_flag INTEGER NOT NULL DEFAULT 0,  -- guard: T6 Can't find patient
  decision TEXT,                           -- guard: T11 Done needs a decision
  summary_enc TEXT,                        -- AI summary (T4), labelled as AI on screen
  stage_changed_at TEXT NOT NULL,
  done_at TEXT,                            -- T14 retention
  closed_at TEXT,                          -- demo: a nurse ended the visit after discharge; off the board
  closed_by TEXT,
  created_at TEXT NOT NULL,
  consent_contact INTEGER NOT NULL,
  consent_transcribe INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day, display_id)
);

CREATE TABLE IF NOT EXISTS id_counters (
  day TEXT NOT NULL,
  prefix TEXT NOT NULL,
  next INTEGER NOT NULL,
  PRIMARY KEY (day, prefix)
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cubicle TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id),
  doctor_id TEXT NOT NULL REFERENCES doctors(id),
  number INTEGER NOT NULL,
  state TEXT NOT NULL,
  end_reason TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  direction TEXT NOT NULL,
  source_enc TEXT NOT NULL,
  translation_enc TEXT,
  back_translation_enc TEXT,
  tier TEXT,                               -- routine | verify | held; null for patient lines
  safety_json TEXT,                        -- rule checker result (encrypted)
  ai_checks_json TEXT,                     -- AI verifier result (encrypted)
  trace_json TEXT,                         -- agent trace (steps, models, retries)
  status TEXT NOT NULL,
  confirmed_by TEXT,                       -- the doctor's Send
  confirmed_at TEXT,
  escalated_at TEXT,
  edits_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attestations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  doctor_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  reason_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id),
  kind TEXT NOT NULL,
  text_enc TEXT NOT NULL,
  original_lang TEXT NOT NULL,
  category TEXT,
  tier TEXT NOT NULL,
  ai_reason TEXT,
  status TEXT NOT NULL,
  handled_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  template_json_enc TEXT NOT NULL,
  transcript_enc TEXT NOT NULL,
  signed_by TEXT,
  signed_at TEXT
);

CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL UNIQUE REFERENCES visits(id),
  content_enc TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  verified_by TEXT,
  released_by TEXT
);

CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  detail_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (      -- a nurse-hosted session; its code lets doctors and patients join
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,                 -- sha256 of the code, for lookup without decrypting
  code_enc TEXT NOT NULL,                  -- the code, encrypted, so a nurse can reveal it
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS follow_ups (  -- tasks drafted by AI after a consultation; the doctor confirms each one
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  doctor_id TEXT NOT NULL,
  text_enc TEXT NOT NULL,
  from_section TEXT,                       -- the note section the draft came from, for the "AI draft" label
  status TEXT NOT NULL,                    -- suggested | confirmed | done | dismissed
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (    -- demo: runtime toggles such as MOCK_AI
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Tables wiped by /demo Reset. The audit log is wiped too so Reset gives an identical start (A2). */
export const RESET_TABLES = [
  "follow_ups",
  "attestations",
  "messages",
  "notes",
  "tests",
  "enquiries",
  "packs",
  "sessions",
  "visits",
  "id_counters",
  "audit",
] as const;
