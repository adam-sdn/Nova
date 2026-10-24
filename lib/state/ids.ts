// Visit display IDs: `A-###`. A per-day counter that only ever goes up, so an ID is never reused the
// same day. IDs carry no personal information. /demo Reset clears the counter on purpose (A2).
import { appConfig } from "@/lib/config";
import type { Ctx } from "./db";

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export const DISPLAY_ID_RE = /^[A-Z]-\d{3,}$/;

export function formatDisplayId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** Call inside a transaction. Returns the next unused ID for today. */
export function nextDisplayId(ctx: Ctx): { day: string; displayId: string } {
  const day = dayOf(ctx.now());
  const prefix = appConfig.idPrefix;
  const row = ctx.db.prepare("SELECT next FROM id_counters WHERE day = ? AND prefix = ?").get(day, prefix) as
    | { next: number }
    | undefined;
  const n = row?.next ?? appConfig.idStart;
  ctx.db
    .prepare(
      "INSERT INTO id_counters (day, prefix, next) VALUES (?, ?, ?) ON CONFLICT(day, prefix) DO UPDATE SET next = excluded.next",
    )
    .run(day, prefix, n + 1);
  return { day, displayId: formatDisplayId(prefix, n) };
}
