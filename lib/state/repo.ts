// Row types and small read helpers. Writes live in service.ts so every write goes through a guard.
import type {
  AttestationKind,
  Decision,
  EnquiryKind,
  EnquiryStatus,
  EnquiryTier,
  MessageDirection,
  MessageStatus,
  MessageTier,
  PackStatus,
  SessionEndReason,
  SessionState,
  TestState,
  VisitStatus,
} from "@/lib/contracts";
import type { DB } from "./db";

export interface VisitRow {
  id: string;
  display_id: string;
  day: string;
  token: string;
  name_enc: string;
  initials_enc: string;
  reason_enc: string;
  language: string;
  status: VisitStatus;
  priority: number | null;
  triage_note_enc: string | null;
  triage_claimed_by: string | null;
  escort_flag: number;
  decision: Decision | null;
  summary_enc: string | null;
  stage_changed_at: string;
  done_at: string | null;
  created_at: string;
  consent_contact: number;
  consent_transcribe: number;
}

export interface SessionRow {
  id: string;
  visit_id: string;
  doctor_id: string;
  number: number;
  state: SessionState;
  end_reason: SessionEndReason | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  direction: MessageDirection;
  source_enc: string;
  translation_enc: string | null;
  back_translation_enc: string | null;
  tier: MessageTier | null;
  safety_json: string | null;
  ai_checks_json: string | null;
  trace_json: string | null;
  status: MessageStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  escalated_at: string | null;
  edits_json: string | null;
  created_at: string;
}

export interface AttestationRow {
  id: string;
  message_id: string;
  session_id: string;
  doctor_id: string;
  kind: AttestationKind;
  reason_enc: string;
  created_at: string;
}

export interface EnquiryRow {
  id: string;
  visit_id: string;
  kind: EnquiryKind;
  text_enc: string;
  original_lang: string;
  category: string | null;
  tier: EnquiryTier;
  ai_reason: string | null;
  status: EnquiryStatus;
  handled_by: string | null;
  created_at: string;
}

export interface TestRow {
  id: string;
  visit_id: string;
  name: string;
  state: TestState;
  created_at: string;
}

export interface PackRow {
  id: string;
  visit_id: string;
  content_enc: string;
  language: string;
  status: PackStatus;
  verified_by: string | null;
  released_by: string | null;
}

export interface DoctorRow {
  id: string;
  name: string;
  cubicle: string;
}

export const getVisit = (db: DB, id: string) =>
  db.prepare("SELECT * FROM visits WHERE id = ?").get(id) as VisitRow | undefined;

export const getVisitByToken = (db: DB, token: string) =>
  db.prepare("SELECT * FROM visits WHERE token = ?").get(token) as VisitRow | undefined;

export const getSession = (db: DB, id: string) =>
  db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;

export const activeSessionFor = (db: DB, visitId: string) =>
  db
    .prepare("SELECT * FROM sessions WHERE visit_id = ? AND state != 'ended' ORDER BY created_at DESC LIMIT 1")
    .get(visitId) as SessionRow | undefined;

export const sessionsFor = (db: DB, visitId: string) =>
  db.prepare("SELECT * FROM sessions WHERE visit_id = ? ORDER BY number, created_at").all(visitId) as SessionRow[];

/** Consultations so far. Escorts that ended as not_found or returned do not count. */
export const consultationCount = (db: DB, visitId: string) =>
  (
    db
      .prepare(
        "SELECT COUNT(*) n FROM sessions WHERE visit_id = ? AND (end_reason IS NULL OR end_reason = 'completed')",
      )
      .get(visitId) as { n: number }
  ).n;

export const testsFor = (db: DB, visitId: string) =>
  db.prepare("SELECT * FROM tests WHERE visit_id = ? ORDER BY created_at, rowid").all(visitId) as TestRow[];

export const getTest = (db: DB, id: string) =>
  db.prepare("SELECT * FROM tests WHERE id = ?").get(id) as TestRow | undefined;

export const packFor = (db: DB, visitId: string) =>
  db.prepare("SELECT * FROM packs WHERE visit_id = ?").get(visitId) as PackRow | undefined;

export const getEnquiry = (db: DB, id: string) =>
  db.prepare("SELECT * FROM enquiries WHERE id = ?").get(id) as EnquiryRow | undefined;

export const enquiriesFor = (db: DB, visitId: string) =>
  db.prepare("SELECT * FROM enquiries WHERE visit_id = ? ORDER BY created_at").all(visitId) as EnquiryRow[];

export const getMessage = (db: DB, id: string) =>
  db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;

export const messagesForVisit = (db: DB, visitId: string) =>
  db
    .prepare(
      "SELECT m.* FROM messages m JOIN sessions s ON s.id = m.session_id WHERE s.visit_id = ? ORDER BY m.created_at, m.rowid",
    )
    .all(visitId) as MessageRow[];

export const attestationFor = (db: DB, messageId: string) =>
  db.prepare("SELECT * FROM attestations WHERE message_id = ? ORDER BY created_at DESC LIMIT 1").get(messageId) as
    | AttestationRow
    | undefined;

/** Escalated messages for this visit that no doctor has attested yet (the nurse "Interpreter needed" chip). */
export const unattestedEscalations = (db: DB, visitId: string) =>
  (
    db
      .prepare(
        `SELECT COUNT(*) n FROM messages m JOIN sessions s ON s.id = m.session_id
         WHERE s.visit_id = ? AND m.status = 'escalated'
           AND NOT EXISTS (SELECT 1 FROM attestations a WHERE a.message_id = m.id)`,
      )
      .get(visitId) as { n: number }
  ).n;

export const getDoctor = (db: DB, id: string) =>
  db.prepare("SELECT * FROM doctors WHERE id = ?").get(id) as DoctorRow | undefined;

export const allDoctors = (db: DB) => db.prepare("SELECT * FROM doctors ORDER BY id").all() as DoctorRow[];
