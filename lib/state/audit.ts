// DB-backed audit log built on lib/privacy's hash chain. Entries hold a hash of the detail, never plaintext.
import { appendAudit, verifyChain, type AuditEntry } from "@/lib/privacy/crypto";
import type { Actor } from "@/lib/contracts";
import type { Ctx, DB } from "./db";

interface AuditRow {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  ref_id: string;
  detail_hash: string;
  prev_hash: string;
  hash: string;
}

const toEntry = (r: AuditRow): AuditEntry => ({
  seq: r.seq,
  ts: r.ts,
  actor: r.actor,
  action: r.action,
  refId: r.ref_id,
  detailHash: r.detail_hash,
  prevHash: r.prev_hash,
  hash: r.hash,
});

export const actorLabel = (a: Actor) => `${a.role}:${a.id}`;

/** Append one entry. `detail` is hashed by appendAudit and never stored. */
export function audit(ctx: Ctx, actor: Actor | string, action: string, refId: string, detail: unknown = ""): AuditEntry {
  const last = ctx.db.prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 1").get() as AuditRow | undefined;
  // appendAudit only reads chain.length and the last entry, so a sparse array avoids loading the whole log.
  const chain: AuditEntry[] = [];
  if (last) {
    chain.length = last.seq + 1;
    chain[last.seq] = toEntry(last);
  }
  const entry = appendAudit(chain, {
    actor: typeof actor === "string" ? actor : actorLabel(actor),
    action,
    refId,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
    ts: ctx.now().toISOString(),
  });
  ctx.db
    .prepare(
      "INSERT INTO audit (seq, ts, actor, action, ref_id, detail_hash, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(entry.seq, entry.ts, entry.actor, entry.action, entry.refId, entry.detailHash, entry.prevHash, entry.hash);
  return entry;
}

export function loadChain(db: DB): AuditEntry[] {
  return (db.prepare("SELECT * FROM audit ORDER BY seq").all() as AuditRow[]).map(toEntry);
}

export function verifyAudit(db: DB): { ok: boolean; brokenAt?: number; length: number } {
  const chain = loadChain(db);
  return { ...verifyChain(chain), length: chain.length };
}
