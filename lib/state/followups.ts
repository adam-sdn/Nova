// Follow-up tasks. After a consultation the AI drafts tasks from the doctor's signed note; each one stays
// "suggested" until the doctor confirms (optionally rewording) or dismisses it. Confirmed tasks are marked done.
// Text is encrypted; audit entries hold hashes only.
import { randomUUID } from "node:crypto";
import type { Actor, ConfirmFollowUpReq, DraftNoteReq, FollowUpStatus, FollowUpView } from "@/lib/contracts";
import { audit } from "./audit";
import { dec, enc } from "./crypt";
import type { Ctx } from "./db";
import { TransitionError } from "./service";

interface Row {
  id: string;
  visit_id: string;
  session_id: string;
  doctor_id: string;
  text_enc: string;
  from_section: string | null;
  status: FollowUpStatus;
  created_at: string;
  confirmed_at: string | null;
  done_at: string | null;
  display_id: string;
  number: number;
}

const SELECT = `SELECT f.*, v.display_id, s.number FROM follow_ups f
  JOIN visits v ON v.id = f.visit_id JOIN sessions s ON s.id = f.session_id`;

function view(ctx: Ctx, r: Row): FollowUpView {
  return {
    id: r.id,
    visitId: r.visit_id,
    displayId: r.display_id,
    sessionNumber: r.number,
    text: dec(ctx, "follow_ups", r.id, "text", r.text_enc),
    fromSection: r.from_section,
    status: r.status,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    doneAt: r.done_at,
  };
}

/**
 * Drafts follow-ups for a completed session from its signed note and tests. Runs after completion, so an AI
 * failure never blocks the consultation; it just leaves no suggestions.
 */
export async function draftFollowUps(ctx: Ctx, sessionId: string): Promise<FollowUpView[]> {
  const s = ctx.db.prepare("SELECT id, visit_id, doctor_id FROM sessions WHERE id = ?").get(sessionId) as
    | { id: string; visit_id: string; doctor_id: string }
    | undefined;
  if (!s) throw new TransitionError("not_found", "Session not found");
  const note = ctx.db.prepare("SELECT id, template_json_enc FROM notes WHERE session_id = ?").get(sessionId) as
    | { id: string; template_json_enc: string }
    | undefined;
  if (!note) return [];
  const v = ctx.db.prepare("SELECT name_enc FROM visits WHERE id = ?").get(s.visit_id) as { name_enc: string };
  const sections = JSON.parse(dec(ctx, "notes", note.id, "template", note.template_json_enc)) as Record<string, string>;
  const tests = (ctx.db.prepare("SELECT name FROM tests WHERE visit_id = ? AND state != 'results_back'").all(s.visit_id) as {
    name: string;
  }[]).map((t) => t.name);
  const name = dec(ctx, "visits", s.visit_id, "name", v.name_enc);
  const drafts = await ctx.ai().draftFollowUps({ sections, tests }, { name });

  const ins = ctx.db.prepare(
    `INSERT INTO follow_ups (id, visit_id, session_id, doctor_id, text_enc, from_section, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'suggested', ?)`,
  );
  const ids = ctx.db.transaction(() =>
    drafts
      .filter((d) => d.text?.trim())
      .map((d) => {
        const id = randomUUID();
        ins.run(id, s.visit_id, sessionId, s.doctor_id, enc(ctx, "follow_ups", id, "text", d.text.trim()), d.fromSection ?? null, ctx.now().toISOString());
        audit(ctx, { role: "system", id: "ai" }, "follow_up.suggest", id, d.text);
        return id;
      }),
  )();
  return ids.map((id) => view(ctx, ctx.db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as Row));
}

/** The doctor's follow-ups, open ones first (suggested, then confirmed), newest first within each. */
export function listFollowUps(ctx: Ctx, doctorId: string): FollowUpView[] {
  const rows = ctx.db
    .prepare(
      `${SELECT} WHERE f.doctor_id = ? AND f.status != 'dismissed'
       ORDER BY CASE f.status WHEN 'suggested' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, f.created_at DESC`,
    )
    .all(doctorId) as Row[];
  return rows.map((r) => view(ctx, r));
}

function load(ctx: Ctx, id: string, actor: Actor): Row {
  const r = ctx.db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as Row | undefined;
  if (!r) throw new TransitionError("not_found", "Follow-up not found");
  if (actor.role !== "doctor" || actor.id !== r.doctor_id) {
    throw new TransitionError("forbidden_role", "Only the doctor who saw the patient can change this follow-up");
  }
  return r;
}

function requireStatus(r: Row, status: FollowUpStatus, verb: string) {
  if (r.status !== status) throw new TransitionError("wrong_status", `Only a ${status} follow-up can be ${verb}`);
}

export function confirmFollowUp(ctx: Ctx, id: string, req: ConfirmFollowUpReq): FollowUpView {
  return ctx.db.transaction(() => {
    const r = load(ctx, id, req.actor);
    requireStatus(r, "suggested", "confirmed");
    const edited = req.text !== undefined;
    ctx.db
      .prepare(`UPDATE follow_ups SET status = 'confirmed', confirmed_at = ?${edited ? ", text_enc = ?" : ""} WHERE id = ?`)
      .run(...[ctx.now().toISOString(), ...(edited ? [enc(ctx, "follow_ups", id, "text", req.text!)] : []), id]);
    audit(ctx, req.actor, edited ? "follow_up.confirm_edited" : "follow_up.confirm", id, req.text ?? "");
    return view(ctx, ctx.db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as Row);
  })();
}

function setStatus(ctx: Ctx, id: string, actor: Actor, from: FollowUpStatus, to: FollowUpStatus, verb: string) {
  return ctx.db.transaction(() => {
    const r = load(ctx, id, actor);
    requireStatus(r, from, verb);
    ctx.db.prepare(`UPDATE follow_ups SET status = ?${to === "done" ? ", done_at = ?" : ""} WHERE id = ?`).run(
      ...(to === "done" ? [to, ctx.now().toISOString(), id] : [to, id]),
    );
    audit(ctx, actor, `follow_up.${to}`, id);
    return view(ctx, ctx.db.prepare(`${SELECT} WHERE f.id = ?`).get(id) as Row);
  })();
}

export const completeFollowUp = (ctx: Ctx, id: string, actor: Actor) => setStatus(ctx, id, actor, "confirmed", "done", "marked done");
export const dismissFollowUp = (ctx: Ctx, id: string, actor: Actor) => setStatus(ctx, id, actor, "suggested", "dismissed", "dismissed");

/** AI draft of the Clinical Assessment template, each section tagged with the conversation lines it came from. */
export async function draftNote(ctx: Ctx, sessionId: string, req: DraftNoteReq) {
  const s = ctx.db.prepare("SELECT visit_id, doctor_id, state FROM sessions WHERE id = ?").get(sessionId) as
    | { visit_id: string; doctor_id: string; state: string }
    | undefined;
  if (!s) throw new TransitionError("not_found", "Session not found");
  if (req.actor.role !== "doctor" || req.actor.id !== s.doctor_id) {
    throw new TransitionError("forbidden_role", "Only the doctor in this session can draft its note");
  }
  if (s.state !== "in_session") throw new TransitionError("wrong_status", "The session is not in progress");
  const v = ctx.db.prepare("SELECT name_enc FROM visits WHERE id = ?").get(s.visit_id) as { name_enc: string };
  const name = dec(ctx, "visits", s.visit_id, "name", v.name_enc);
  const draft = await ctx.ai().draftNote(req.transcript, req.sections, { name });
  audit(ctx, req.actor, "note.ai_draft", sessionId, req.transcript.length);
  return { draft };
}
