// Builds the JSON views returned to each window. Decryption happens here, on the server only.
import type {
  EnquiryView,
  MessageView,
  PackContent,
  PackView,
  PatientState,
  SessionView,
  StaffState,
  VisitCard,
} from "@/lib/contracts";
import { appConfig, phraseTable } from "@/lib/config";
import { audit } from "./audit";
import { dec, decOrNull } from "./crypt";
import { isMockAi, type Ctx } from "./db";
import { getPatientVisibleContent } from "./patientVisible";
import {
  activeSessionFor,
  allDoctors,
  attestationFor,
  consultationCount,
  enquiriesFor,
  getDoctor,
  getVisitByToken,
  messagesForVisit,
  packFor,
  testsFor,
  unattestedEscalations,
  type EnquiryRow,
  type MessageRow,
  type PackRow,
  type SessionRow,
  type VisitRow,
} from "./repo";

const DECRYPT_AUDIT_EVERY_MS = 60_000;

/**
 * Audit decryptions (H5). Windows poll every 1 to 2 seconds, so one entry per viewer and field set
 * per minute is written instead of one per poll.
 */
function auditDecrypt(ctx: Ctx, viewer: string, fields: string, refIds: string[]) {
  const key = `${viewer}|${fields}`;
  const now = ctx.now().getTime();
  const last = ctx.decryptAuditAt.get(key);
  if (last !== undefined && now - last < DECRYPT_AUDIT_EVERY_MS) return;
  ctx.decryptAuditAt.set(key, now);
  audit(ctx, viewer, "data.decrypted", fields, refIds);
}

export function sessionView(ctx: Ctx, s: SessionRow): SessionView {
  const d = getDoctor(ctx.db, s.doctor_id);
  return {
    id: s.id,
    visitId: s.visit_id,
    doctorId: s.doctor_id,
    doctorName: d?.name ?? s.doctor_id,
    cubicle: d?.cubicle ?? "",
    number: s.number,
    state: s.state,
    endReason: s.end_reason,
    createdAt: s.created_at,
    startedAt: s.started_at,
    endedAt: s.ended_at,
  };
}

export function messageView(ctx: Ctx, m: MessageRow): MessageView {
  const a = attestationFor(ctx.db, m.id);
  return {
    id: m.id,
    sessionId: m.session_id,
    direction: m.direction,
    source: dec(ctx, "messages", m.id, "source", m.source_enc),
    translation: decOrNull(ctx, "messages", m.id, "translation", m.translation_enc),
    backTranslation: decOrNull(ctx, "messages", m.id, "back_translation", m.back_translation_enc),
    tier: m.tier,
    status: m.status,
    safety: m.safety_json ? JSON.parse(m.safety_json) : null,
    aiChecks: m.ai_checks_json ? JSON.parse(m.ai_checks_json) : null,
    trace: m.trace_json ? JSON.parse(m.trace_json) : null,
    confirmedBy: m.confirmed_by,
    confirmedAt: m.confirmed_at,
    escalatedAt: m.escalated_at,
    attestation: a ? { kind: a.kind, doctorId: a.doctor_id, createdAt: a.created_at } : null,
    createdAt: m.created_at,
  };
}

export function enquiryView(ctx: Ctx, e: EnquiryRow, displayId: string): EnquiryView {
  return {
    id: e.id,
    visitId: e.visit_id,
    displayId,
    kind: e.kind,
    text: dec(ctx, "enquiries", e.id, "text", e.text_enc),
    originalLang: e.original_lang,
    category: e.category,
    tier: e.tier,
    aiReason: e.ai_reason,
    status: e.status,
    handledBy: e.handled_by,
    createdAt: e.created_at,
  };
}

export function packView(ctx: Ctx, p: PackRow): PackView {
  return {
    id: p.id,
    visitId: p.visit_id,
    language: p.language,
    status: p.status,
    content: JSON.parse(dec(ctx, "packs", p.id, "content", p.content_enc)) as PackContent,
    releasedBy: p.released_by,
  };
}

export function visitCard(ctx: Ctx, v: VisitRow, showNames: boolean): VisitCard {
  const active = activeSessionFor(ctx.db, v.id);
  const enquiries = enquiriesFor(ctx.db, v.id).filter((e) => e.status === "open");
  return {
    id: v.id,
    displayId: v.display_id,
    initials: dec(ctx, "visits", v.id, "initials", v.initials_enc),
    name: showNames ? dec(ctx, "visits", v.id, "name", v.name_enc) : null,
    language: v.language,
    status: v.status,
    priority: v.priority,
    stageChangedAt: v.stage_changed_at,
    createdAt: v.created_at,
    beingTriagedBy: v.status === "triage_waiting" ? v.triage_claimed_by : null,
    escortFlag: v.escort_flag === 1,
    decision: v.decision,
    tests: testsFor(ctx.db, v.id).map((t) => ({ id: t.id, name: t.name, state: t.state })),
    activeSession: active ? sessionView(ctx, active) : null,
    sessionCount: consultationCount(ctx.db, v.id),
    openEnquiries: enquiries.length,
    urgentEnquiry: enquiries.some((e) => e.tier === "urgent"),
    interpreterNeeded: unattestedEscalations(ctx.db, v.id) > 0,
    summary: v.summary_enc ? JSON.parse(dec(ctx, "visits", v.id, "summary", v.summary_enc)) : null,
  };
}

/** Visits still on the active board: Done cards drop off after doneRetentionMinutes (T14). */
export function boardVisits(ctx: Ctx): VisitRow[] {
  const cutoff = new Date(ctx.now().getTime() - appConfig.doneRetentionMinutes * 60_000).toISOString();
  return ctx.db
    .prepare("SELECT * FROM visits WHERE status != 'done' OR done_at > ? ORDER BY created_at, rowid")
    .all(cutoff) as VisitRow[];
}

export function staffState(ctx: Ctx, role: StaffState["role"], showNames: boolean, viewerId: string = role): StaffState {
  const rows = boardVisits(ctx);
  const visits = rows.map((v) => visitCard(ctx, v, showNames));
  const byId = new Map(rows.map((v) => [v.id, v.display_id]));
  const enquiries = (ctx.db.prepare("SELECT * FROM enquiries ORDER BY created_at").all() as EnquiryRow[])
    .filter((e) => byId.has(e.visit_id))
    .map((e) => enquiryView(ctx, e, byId.get(e.visit_id)!));
  const messages = rows.flatMap((v) => messagesForVisit(ctx.db, v.id)).map((m) => messageView(ctx, m));
  if (rows.length) {
    auditDecrypt(ctx, `${role}:${viewerId}`, showNames ? "board+names" : "board", rows.map((r) => r.id));
  }
  return {
    role,
    now: ctx.now().toISOString(),
    visits,
    enquiries,
    messages,
    doctors: allDoctors(ctx.db),
    mockAi: isMockAi(ctx.db),
    demoDefaultsInUse: appConfig.demoDefaultsInUse,
  };
}

/** The patient window's view. Everything it contains passes through getPatientVisibleContent(). */
export function patientState(ctx: Ctx, token: string): PatientState | null {
  const v = getVisitByToken(ctx.db, token);
  if (!v) return null;
  const active = activeSessionFor(ctx.db, v.id);
  const pack = packFor(ctx.db, v.id);
  const visible = getPatientVisibleContent({
    status: v.status,
    language: v.language,
    messages: messagesForVisit(ctx.db, v.id).map((m) => messageView(ctx, m)),
    pack: pack ? packView(ctx, pack) : null,
    phrases: phraseTable,
  });
  auditDecrypt(ctx, `patient:${v.display_id}`, "patient-view", [v.id]);
  return {
    role: "patient",
    now: ctx.now().toISOString(),
    visit: {
      displayId: v.display_id,
      language: v.language,
      status: v.status,
      enquiriesOpen: visible.enquiriesOpen,
      escortRequested: active?.state === "waiting",
      inSession: v.status === "consultation",
      calledForTriage: v.status === "triage_waiting" && !!v.triage_claimed_by,
    },
    messages: visible.messages,
    pendingCount: visible.pendingCount,
    pack: visible.pack,
    packPreparing: visible.packPreparing,
    phrases: visible.phrases,
  };
}
