// Shift sessions: nurses on a shift host one session. Doctors and patients join it with its code.
// The code is stored encrypted (so a nurse can reveal it) and hashed (so a join can be checked without decrypting).
// Shifts are not wiped by /demo Reset, so a reset mid-demo does not log everyone out.
import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Actor } from "@/lib/contracts";
import { audit } from "./audit";
import { dec, enc } from "./crypt";
import type { Ctx } from "./db";
import { TransitionError } from "./service";

// No 0/O, 1/I/L: easy to read aloud and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export interface ShiftInfo {
  id: string;
  openedBy: string;
  openedAt: string;
}

interface ShiftRow {
  id: string;
  code_enc: string;
  opened_by: string;
  opened_at: string;
}

export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const hashCode = (code: string) => createHash("sha256").update(normaliseCode(code)).digest("hex");

function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

const info = (r: ShiftRow): ShiftInfo => ({ id: r.id, openedBy: r.opened_by, openedAt: r.opened_at });

function openRow(ctx: Ctx): ShiftRow | undefined {
  return ctx.db.prepare("SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1").get() as ShiftRow | undefined;
}

export function currentShift(ctx: Ctx): ShiftInfo | null {
  const r = openRow(ctx);
  return r ? info(r) : null;
}

/** Opens a session for the shift. If one is already open, the nurse joins it instead. */
export function openShift(ctx: Ctx, actor: Actor): ShiftInfo {
  if (actor.role !== "nurse") throw new TransitionError("forbidden_role", "Only a nurse can start a session");
  return ctx.db.transaction(() => {
    const existing = openRow(ctx);
    if (existing) return info(existing);
    const id = randomUUID();
    const code = newCode();
    const at = ctx.now().toISOString();
    ctx.db
      .prepare("INSERT INTO shifts (id, code_hash, code_enc, opened_by, opened_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, hashCode(code), enc(ctx, "shifts", id, "code", code), actor.id, at);
    audit(ctx, actor, "shift.open", id);
    return { id, openedBy: actor.id, openedAt: at };
  })();
}

/** The open session's code, for a nurse who taps to reveal it. Each reveal is audited. */
export function revealCode(ctx: Ctx, actor: Actor): string {
  if (actor.role !== "nurse") throw new TransitionError("forbidden_role", "Only a nurse can reveal the session code");
  const r = openRow(ctx);
  if (!r) throw new TransitionError("no_session", "No session is open");
  audit(ctx, actor, "shift.reveal_code", r.id);
  return dec(ctx, "shifts", r.id, "code", r.code_enc);
}

/** The open session matching `code`, or null if the code is wrong or the session has ended. */
export function checkCode(ctx: Ctx, code: string | null | undefined): ShiftInfo | null {
  if (!code) return null;
  const r = ctx.db.prepare("SELECT * FROM shifts WHERE code_hash = ? AND closed_at IS NULL").get(hashCode(code)) as
    | ShiftRow
    | undefined;
  return r ? info(r) : null;
}

/** Like checkCode, but throws the error a route returns. */
export function requireCode(ctx: Ctx, code: string | null | undefined): ShiftInfo {
  const s = checkCode(ctx, code);
  if (!s) throw new TransitionError("bad_session_code", "That session code is not valid, or the session has ended");
  return s;
}

export function closeShift(ctx: Ctx, actor: Actor): void {
  if (actor.role !== "nurse") throw new TransitionError("forbidden_role", "Only a nurse can end the session");
  const r = openRow(ctx);
  if (!r) throw new TransitionError("no_session", "No session is open");
  ctx.db.prepare("UPDATE shifts SET closed_by = ?, closed_at = ? WHERE id = ?").run(actor.id, ctx.now().toISOString(), r.id);
  audit(ctx, actor, "shift.close", r.id);
}
