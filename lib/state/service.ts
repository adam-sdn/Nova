// Every state change in the app. Each one: load facts -> guard (machine.ts) -> write -> audit, inside a
// single SQLite transaction, then return the new state. Rejected changes write nothing.
// AI calls (async) run before the transaction; their output is a draft or suggestion only.
import { randomBytes, randomUUID } from "node:crypto";
import {
  ENQUIRY_OPEN_STATUSES,
  type Actor,
  type CheckinReq,
  type CheckinResult,
  type CompleteSessionReq,
  type DecisionReq,
  type EnquiryPriorityReq,
  type EnquiryReq,
  type EnquiryView,
  type EscortedReq,
  type MessageReq,
  type MessageView,
  type PackView,
  type ReopenReq,
  type SessionView,
  type StartSessionReq,
  type TestUpdateReq,
  type TriageReq,
  type VerifyMessageReq,
  type VisitCard,
  type VisitStatus,
} from "@/lib/contracts";
import { appConfig } from "@/lib/config";
import { audit, actorLabel } from "./audit";
import { dec, enc } from "./crypt";
import type { Ctx } from "./db";
import { nextDisplayId } from "./ids";
import { check, checkCheckin, type GuardFacts, type GuardResult, type TransitionName } from "./machine";
import {
  activeSessionFor,
  consultationCount,
  enquiriesFor,
  getEnquiry,
  getMessage,
  getSession,
  getTest,
  getVisit,
  packFor,
  testsFor,
  type SessionRow,
  type VisitRow,
} from "./repo";
import { enquiryView, messageView, packView, sessionView, visitCard } from "./views";

export class TransitionError extends Error {
  constructor(
    public code: "forbidden_role" | "wrong_status" | "guard_failed" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
  get httpStatus(): number {
    return this.code === "not_found" ? 404 : this.code === "forbidden_role" ? 403 : 409;
  }
}

function must(r: GuardResult): VisitStatus {
  if (!r.ok) throw new TransitionError(r.code, r.message);
  return r.to;
}

const iso = (ctx: Ctx) => ctx.now().toISOString();
const newId = () => randomUUID();

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (s: string) => Array.from(s)[0]?.toLocaleUpperCase() ?? "";
  return parts.length > 1 ? first(parts[0]) + first(parts[parts.length - 1]) : first(parts[0] ?? "?");
}

function loadVisit(ctx: Ctx, id: string): VisitRow {
  const v = getVisit(ctx.db, id);
  if (!v) throw new TransitionError("not_found", `Visit ${id} not found`);
  return v;
}

function loadSession(ctx: Ctx, id: string): SessionRow {
  const s = getSession(ctx.db, id);
  if (!s) throw new TransitionError("not_found", `Session ${id} not found`);
  return s;
}

function baseFacts(ctx: Ctx, v: VisitRow, actor: Actor): GuardFacts {
  const active = activeSessionFor(ctx.db, v.id);
  const pack = packFor(ctx.db, v.id);
  return {
    status: v.status,
    actor,
    triageClaimedBy: v.triage_claimed_by,
    activeSession: active ? { doctorId: active.doctor_id, state: active.state } : null,
    tests: testsFor(ctx.db, v.id).map((t) => t.state),
    packStatus: pack?.status ?? null,
    packLanguage: pack?.language ?? null,
    priorityScale: appConfig.priorityScale,
  };
}

/** Guard + status write + audit for a visit-level transition. */
function transition(
  ctx: Ctx,
  name: TransitionName,
  v: VisitRow,
  actor: Actor,
  extra: Partial<GuardFacts> = {},
  detail: Record<string, unknown> = {},
): VisitStatus {
  const to = must(check(name, { ...baseFacts(ctx, v, actor), ...extra }));
  if (to !== v.status) {
    ctx.db
      .prepare("UPDATE visits SET status = ?, stage_changed_at = ?, done_at = ? WHERE id = ?")
      .run(to, iso(ctx), to === "done" ? iso(ctx) : null, v.id);
  }
  audit(ctx, actor, `visit.${name}`, v.id, { from: v.status, to, ...detail });
  return to;
}

const card = (ctx: Ctx, visitId: string): VisitCard => visitCard(ctx, loadVisit(ctx, visitId), false);

const tx = <T>(ctx: Ctx, fn: () => T): T => ctx.db.transaction(fn)();

const SYSTEM: Actor = { role: "system", id: "auto" };

// ---------------------------------------------------------------------------
// T1, T2 check-in and registration
// ---------------------------------------------------------------------------

export async function checkin(
  ctx: Ctx,
  req: CheckinReq,
  opts: { register?: boolean } = {},
): Promise<CheckinResult & { visit: VisitCard }> {
  must(checkCheckin(req));
  const intake = await ctx.ai().translateIntake(req.reason, req.language, { name: req.name });
  return tx(ctx, () => {
    const id = newId();
    const token = randomBytes(16).toString("base64url");
    const { day, displayId } = nextDisplayId(ctx);
    const now = iso(ctx);
    const reason = JSON.stringify({ original: intake.original, english: intake.english, language: req.language });
    ctx.db
      .prepare(
        `INSERT INTO visits (id, display_id, day, token, name_enc, initials_enc, reason_enc, language, status,
          stage_changed_at, created_at, consent_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'arrival', ?, ?, 1)`,
      )
      .run(
        id,
        displayId,
        day,
        token,
        enc(ctx, "visits", id, "name", req.name),
        enc(ctx, "visits", id, "initials", initialsOf(req.name)),
        enc(ctx, "visits", id, "reason", reason),
        req.language,
        now,
        now,
      );
    const patient: Actor = { role: "patient", id: displayId };
    audit(ctx, patient, "visit.checkin", id, { to: "arrival", language: req.language });
    if (opts.register !== false) transition(ctx, "register", loadVisit(ctx, id), SYSTEM);
    return { visitId: id, displayId, token, visit: card(ctx, id) };
  });
}

export async function register(ctx: Ctx, visitId: string, actor: Actor) {
  return tx(ctx, () => {
    transition(ctx, "register", loadVisit(ctx, visitId), actor);
    return { visit: card(ctx, visitId) };
  });
}

// ---------------------------------------------------------------------------
// T3, T4 triage
// ---------------------------------------------------------------------------

export async function callTriage(ctx: Ctx, visitId: string, actor: Actor) {
  return tx(ctx, () => {
    const v = loadVisit(ctx, visitId);
    transition(ctx, "call_triage", v, actor);
    ctx.db.prepare("UPDATE visits SET triage_claimed_by = ? WHERE id = ?").run(actor.id, visitId);
    return { visit: card(ctx, visitId) };
  });
}

export async function completeTriage(ctx: Ctx, visitId: string, req: TriageReq) {
  const v = loadVisit(ctx, visitId);
  // Check the guard before spending an AI call; it is checked again inside the transaction.
  must(check("complete_triage", { ...baseFacts(ctx, v, req.actor), priority: req.priority }));
  const name = dec(ctx, "visits", v.id, "name", v.name_enc);
  const reason = JSON.parse(dec(ctx, "visits", v.id, "reason", v.reason_enc)) as { english: string };
  const enquiries = enquiriesFor(ctx.db, v.id).map((e) => dec(ctx, "enquiries", e.id, "text", e.text_enc));
  const summary = await ctx.ai().summarisePatient(
    { reason: reason.english, triageNote: req.note, enquiries },
    { name },
  );
  return tx(ctx, () => {
    const fresh = loadVisit(ctx, visitId);
    transition(ctx, "complete_triage", fresh, req.actor, { priority: req.priority }, { priority: req.priority });
    ctx.db
      .prepare("UPDATE visits SET priority = ?, triage_note_enc = ?, summary_enc = ?, triage_claimed_by = NULL WHERE id = ?")
      .run(
        req.priority,
        enc(ctx, "visits", visitId, "triage_note", req.note),
        enc(ctx, "visits", visitId, "summary", JSON.stringify(summary)),
        visitId,
      );
    return { visit: card(ctx, visitId) };
  });
}

// ---------------------------------------------------------------------------
// T5 to T9 sessions
// ---------------------------------------------------------------------------

function createSession(ctx: Ctx, visitId: string, doctorId: string): SessionView {
  const id = newId();
  const number = consultationCount(ctx.db, visitId) + 1;
  ctx.db
    .prepare("INSERT INTO sessions (id, visit_id, doctor_id, number, state, created_at) VALUES (?, ?, ?, ?, 'waiting', ?)")
    .run(id, visitId, doctorId, number, iso(ctx));
  ctx.db.prepare("UPDATE visits SET escort_flag = 0 WHERE id = ?").run(visitId);
  return sessionView(ctx, loadSession(ctx, id));
}

export async function consultNow(ctx: Ctx, visitId: string, actor: Actor) {
  return tx(ctx, () => {
    if (!getDoctorRow(ctx, actor.id)) throw new TransitionError("guard_failed", `Unknown doctor ${actor.id}`);
    transition(ctx, "consult_now", loadVisit(ctx, visitId), actor);
    const session = createSession(ctx, visitId, actor.id);
    return { session, visit: card(ctx, visitId) };
  });
}

const getDoctorRow = (ctx: Ctx, id: string) => ctx.db.prepare("SELECT id FROM doctors WHERE id = ?").get(id);

function endSession(ctx: Ctx, sessionId: string, reason: "completed" | "not_found" | "returned") {
  ctx.db
    .prepare("UPDATE sessions SET state = 'ended', end_reason = ?, ended_at = ? WHERE id = ?")
    .run(reason, iso(ctx), sessionId);
}

export async function escorted(ctx: Ctx, sessionId: string, req: EscortedReq) {
  return tx(ctx, () => {
    const s = loadSession(ctx, sessionId);
    const v = loadVisit(ctx, s.visit_id);
    if (req.outcome === "with_doctor") {
      transition(ctx, "escort_confirm", v, req.actor, {}, { sessionId });
      ctx.db.prepare("UPDATE sessions SET state = 'ready' WHERE id = ?").run(sessionId);
    } else {
      transition(ctx, "escort_not_found", v, req.actor, {}, { sessionId });
      endSession(ctx, sessionId, "not_found");
      ctx.db.prepare("UPDATE visits SET escort_flag = 1 WHERE id = ?").run(v.id);
    }
    return { session: sessionView(ctx, loadSession(ctx, sessionId)), visit: card(ctx, v.id) };
  });
}

export async function returnToQueue(ctx: Ctx, sessionId: string, actor: Actor) {
  return tx(ctx, () => {
    const s = loadSession(ctx, sessionId);
    transition(ctx, "return_to_queue", loadVisit(ctx, s.visit_id), actor, {}, { sessionId });
    endSession(ctx, sessionId, "returned");
    return { session: sessionView(ctx, loadSession(ctx, sessionId)), visit: card(ctx, s.visit_id) };
  });
}

export async function startSession(ctx: Ctx, sessionId: string, req: StartSessionReq) {
  return tx(ctx, () => {
    const s = loadSession(ctx, sessionId);
    transition(ctx, "start_session", loadVisit(ctx, s.visit_id), req.actor, {
      transcriptionConsent: req.transcriptionConsent,
    }, { sessionId });
    ctx.db.prepare("UPDATE sessions SET state = 'in_session', started_at = ? WHERE id = ?").run(iso(ctx), sessionId);
    ctx.db.prepare("UPDATE visits SET consent_transcribe = 1 WHERE id = ?").run(s.visit_id);
    return { session: sessionView(ctx, loadSession(ctx, sessionId)), visit: card(ctx, s.visit_id) };
  });
}

function addTests(ctx: Ctx, visitId: string, names: string[]) {
  const ins = ctx.db.prepare("INSERT INTO tests (id, visit_id, name, state, created_at) VALUES (?, ?, ?, 'ordered', ?)");
  for (const n of names) ins.run(newId(), visitId, n, iso(ctx));
}

export async function completeSession(ctx: Ctx, sessionId: string, req: CompleteSessionReq) {
  return tx(ctx, () => {
    const s = loadSession(ctx, sessionId);
    const name: TransitionName = req.next === "tests" ? "complete_to_tests" : "complete_to_decision";
    transition(ctx, name, loadVisit(ctx, s.visit_id), req.actor, {
      noteSigned: req.note.signed,
      testsToOrder: req.tests.length,
    }, { sessionId, tests: req.tests });
    const noteId = newId();
    ctx.db
      .prepare("INSERT INTO notes (id, session_id, template_json_enc, transcript_enc, signed_by, signed_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        noteId,
        sessionId,
        enc(ctx, "notes", noteId, "template", JSON.stringify(req.note.sections)),
        enc(ctx, "notes", noteId, "transcript", JSON.stringify(req.note.transcript)),
        req.actor.id,
        iso(ctx),
      );
    if (req.next === "tests") addTests(ctx, s.visit_id, req.tests);
    endSession(ctx, sessionId, "completed");
    return { session: sessionView(ctx, loadSession(ctx, sessionId)), visit: card(ctx, s.visit_id) };
  });
}

// ---------------------------------------------------------------------------
// T10 tests, T13 backward moves
// ---------------------------------------------------------------------------

export async function updateTest(ctx: Ctx, visitId: string, testId: string, req: TestUpdateReq) {
  return tx(ctx, () => {
    const t = getTest(ctx.db, testId);
    if (!t || t.visit_id !== visitId) throw new TransitionError("not_found", `Test ${testId} not found on this visit`);
    transition(ctx, "update_test", loadVisit(ctx, visitId), req.actor, {}, { testId, from: t.state, state: req.state });
    ctx.db.prepare("UPDATE tests SET state = ? WHERE id = ?").run(req.state, testId);
    return { visit: card(ctx, visitId) };
  });
}

export async function moveToDecision(ctx: Ctx, visitId: string, actor: Actor) {
  return tx(ctx, () => {
    transition(ctx, "move_to_decision", loadVisit(ctx, visitId), actor);
    return { visit: card(ctx, visitId) };
  });
}

export async function reopen(ctx: Ctx, visitId: string, req: ReopenReq) {
  return tx(ctx, () => {
    const v = loadVisit(ctx, visitId);
    if (req.kind === "more_tests") {
      transition(ctx, "order_more_tests", v, req.actor, { testsToOrder: req.tests.length }, { tests: req.tests });
      addTests(ctx, visitId, req.tests);
      return { visit: card(ctx, visitId), session: null };
    }
    transition(ctx, "second_look", v, req.actor);
    const session = createSession(ctx, visitId, req.actor.id);
    return { visit: card(ctx, visitId), session };
  });
}

// ---------------------------------------------------------------------------
// T11, T12 decision and results pack
// ---------------------------------------------------------------------------

export async function recordDecision(ctx: Ctx, visitId: string, req: DecisionReq) {
  const v = loadVisit(ctx, visitId);
  must(check("record_decision", { ...baseFacts(ctx, v, req.actor), decision: req.outcome }));
  const name = dec(ctx, "visits", v.id, "name", v.name_enc);
  const drafted = await ctx.ai().draftPack(
    { results: req.results, advice: req.advice, medicines: req.medicines },
    v.language,
    { name },
  );
  return tx(ctx, () => {
    const fresh = loadVisit(ctx, visitId);
    transition(ctx, "record_decision", fresh, req.actor, { decision: req.outcome }, { outcome: req.outcome });
    ctx.db.prepare("UPDATE visits SET decision = ? WHERE id = ?").run(req.outcome, visitId);
    // "When to seek help" is fixed clinician wording from config, never AI output (G5).
    const content = { ...drafted, whenToSeekHelp: appConfig.whenToSeekHelpText };
    const existing = packFor(ctx.db, visitId);
    const packId = existing?.id ?? newId();
    ctx.db
      .prepare(
        `INSERT INTO packs (id, visit_id, content_enc, language, status) VALUES (?, ?, ?, ?, 'draft')
         ON CONFLICT(visit_id) DO UPDATE SET content_enc = excluded.content_enc, status = 'draft', verified_by = NULL, released_by = NULL`,
      )
      .run(packId, visitId, enc(ctx, "packs", packId, "content", JSON.stringify(content)), fresh.language);
    audit(ctx, req.actor, "pack.drafted", visitId, content);
    return { visit: card(ctx, visitId), pack: packView(ctx, packFor(ctx.db, visitId)!) };
  });
}

export async function verifyPack(ctx: Ctx, visitId: string, actor: Actor) {
  return tx(ctx, () => {
    transition(ctx, "verify_pack", loadVisit(ctx, visitId), actor);
    ctx.db.prepare("UPDATE packs SET status = 'verified', verified_by = ? WHERE visit_id = ?").run(actorLabel(actor), visitId);
    return { visit: card(ctx, visitId), pack: packView(ctx, packFor(ctx.db, visitId)!) };
  });
}

export async function releasePack(ctx: Ctx, visitId: string, actor: Actor): Promise<{ visit: VisitCard; pack: PackView }> {
  return tx(ctx, () => {
    transition(ctx, "release_pack", loadVisit(ctx, visitId), actor);
    ctx.db.prepare("UPDATE packs SET status = 'released', released_by = ? WHERE visit_id = ?").run(actor.id, visitId);
    return { visit: card(ctx, visitId), pack: packView(ctx, packFor(ctx.db, visitId)!) };
  });
}

// ---------------------------------------------------------------------------
// Enquiries. Stage 0 stubs: tiering rules (lib/rules/enquiry) are built in the nurse worktree.
// Until then a message goes to "Needs nurse review"; "I feel worse" is always Urgent.
// ---------------------------------------------------------------------------

function requirePatient(v: VisitRow, actor: Actor) {
  if (actor.role !== "patient") throw new TransitionError("forbidden_role", "Only the patient can send an enquiry");
  if (actor.id !== v.token) throw new TransitionError("forbidden_role", "This patient token does not match the visit");
}

export async function createEnquiry(ctx: Ctx, req: EnquiryReq): Promise<{ enquiry: EnquiryView }> {
  const v = loadVisit(ctx, req.visitId);
  requirePatient(v, req.actor);
  if (req.kind === "feel_worse" ? v.status === "done" : !ENQUIRY_OPEN_STATUSES.includes(v.status)) {
    throw new TransitionError("wrong_status", `Enquiries are closed while the visit is ${v.status}`);
  }
  if (req.kind === "message" && !req.text) throw new TransitionError("guard_failed", "The enquiry text is empty");
  const name = dec(ctx, "visits", v.id, "name", v.name_enc);
  const ai = req.kind === "message" ? await ctx.ai().classifyEnquiry(req.text, { name }) : null;
  return tx(ctx, () => {
    const id = newId();
    const tier = req.kind === "feel_worse" ? "urgent" : "needs_review";
    ctx.db
      .prepare(
        `INSERT INTO enquiries (id, visit_id, kind, text_enc, original_lang, category, tier, ai_reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        id,
        v.id,
        req.kind,
        enc(ctx, "enquiries", id, "text", req.kind === "feel_worse" ? "I feel worse" : req.text),
        v.language,
        ai?.category ?? null,
        tier,
        ai?.reason ?? null,
        iso(ctx),
      );
    audit(ctx, { role: "patient", id: v.display_id }, `enquiry.${req.kind}`, id, { visitId: v.id, tier });
    return { enquiry: enquiryView(ctx, getEnquiry(ctx.db, id)!, v.display_id) };
  });
}

function loadEnquiry(ctx: Ctx, id: string) {
  const e = getEnquiry(ctx.db, id);
  if (!e) throw new TransitionError("not_found", `Enquiry ${id} not found`);
  return e;
}

const displayIdOf = (ctx: Ctx, visitId: string) => loadVisit(ctx, visitId).display_id;

export async function handleEnquiry(ctx: Ctx, id: string, actor: Actor) {
  return tx(ctx, () => {
    const e = loadEnquiry(ctx, id);
    if (actor.role !== "nurse") throw new TransitionError("forbidden_role", "Only a nurse can mark an enquiry handled");
    if (e.status !== "open") throw new TransitionError("wrong_status", "This enquiry is already handled");
    ctx.db.prepare("UPDATE enquiries SET status = 'handled', handled_by = ? WHERE id = ?").run(actor.id, id);
    audit(ctx, actor, "enquiry.handled", id);
    return { enquiry: enquiryView(ctx, getEnquiry(ctx.db, id)!, displayIdOf(ctx, e.visit_id)) };
  });
}

/** Nurse override: the nurse may set any tier (D6). The AI may never lower one; that rule lives in lib/rules. */
export async function setEnquiryTier(ctx: Ctx, id: string, req: EnquiryPriorityReq) {
  return tx(ctx, () => {
    const e = loadEnquiry(ctx, id);
    if (req.actor.role !== "nurse") throw new TransitionError("forbidden_role", "Only a nurse can change an enquiry priority");
    ctx.db.prepare("UPDATE enquiries SET tier = ? WHERE id = ?").run(req.tier, id);
    audit(ctx, req.actor, "enquiry.priority_override", id, { from: e.tier, to: req.tier });
    return { enquiry: enquiryView(ctx, getEnquiry(ctx.db, id)!, displayIdOf(ctx, e.visit_id)) };
  });
}

// ---------------------------------------------------------------------------
// Session messages. Stage 0 stub: every line waits for the interpreter (tier "verify").
// The real pipeline (safety checker, retries, tiers) is built in the interpreter worktree.
// ---------------------------------------------------------------------------

export async function createMessage(ctx: Ctx, sessionId: string, req: MessageReq): Promise<{ message: MessageView }> {
  const s = loadSession(ctx, sessionId);
  const v = loadVisit(ctx, s.visit_id);
  if (s.state !== "in_session") throw new TransitionError("wrong_status", "The session is not in progress");
  if (req.direction === "doctor_to_patient") {
    if (req.actor.role !== "doctor" || req.actor.id !== s.doctor_id) {
      throw new TransitionError("forbidden_role", "Only this session's doctor can send doctor lines");
    }
  } else {
    requirePatient(v, req.actor);
  }
  const [from, to] = req.direction === "doctor_to_patient" ? ["en", v.language] : [v.language, "en"];
  const ids = { name: dec(ctx, "visits", v.id, "name", v.name_enc) };
  const ai = ctx.ai();
  const translation = await ai.translateMessage(req.text, from, to, ids);
  const back = await ai.backTranslate(translation, to, from, ids);
  return tx(ctx, () => {
    const id = newId();
    ctx.db
      .prepare(
        `INSERT INTO messages (id, session_id, direction, source_enc, translation_enc, back_translation_enc, tier, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'verify', 'awaiting_verifier', ?)`,
      )
      .run(
        id,
        sessionId,
        req.direction,
        enc(ctx, "messages", id, "source", req.text),
        enc(ctx, "messages", id, "translation", translation),
        enc(ctx, "messages", id, "back_translation", back),
        iso(ctx),
      );
    audit(ctx, req.direction === "doctor_to_patient" ? req.actor : `patient:${v.display_id}`, "message.drafted", id, { sessionId });
    return { message: messageView(ctx, getMessage(ctx.db, id)!) };
  });
}

export async function verifyMessage(ctx: Ctx, messageId: string, req: VerifyMessageReq) {
  return tx(ctx, () => {
    const m = getMessage(ctx.db, messageId);
    if (!m) throw new TransitionError("not_found", `Message ${messageId} not found`);
    if (req.actor.role !== "interpreter") throw new TransitionError("forbidden_role", "Only the interpreter can verify");
    if (m.status !== "awaiting_verifier") throw new TransitionError("wrong_status", `Message is ${m.status}, not awaiting the verifier`);
    if (m.tier === "hold" && req.action !== "reject" && !req.confirmText?.trim()) {
      throw new TransitionError("guard_failed", "Hold-tier messages need the extra typed confirmation");
    }
    const now = iso(ctx);
    if (req.action === "edit") {
      if (!req.editedTranslation) throw new TransitionError("guard_failed", "An edit needs the corrected translation");
      const edits = JSON.parse(m.edits_json ?? "[]") as unknown[];
      edits.push({ by: actorLabel(req.actor), at: now });
      ctx.db
        .prepare("UPDATE messages SET status = 'edited', translation_enc = ?, edits_json = ?, verified_by = ?, verified_at = ? WHERE id = ?")
        .run(enc(ctx, "messages", m.id, "translation", req.editedTranslation), JSON.stringify(edits), req.actor.id, now, m.id);
    } else {
      const status = req.action === "verify" ? "verified" : "rejected";
      ctx.db
        .prepare("UPDATE messages SET status = ?, verified_by = ?, verified_at = ? WHERE id = ?")
        .run(status, req.actor.id, now, m.id);
    }
    audit(ctx, req.actor, `message.${req.action}`, m.id);
    return { message: messageView(ctx, getMessage(ctx.db, m.id)!) };
  });
}
