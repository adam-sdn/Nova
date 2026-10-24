import { z } from "zod";
import { get } from "@/lib/api";
import { staffState } from "@/lib/state/views";

export const dynamic = "force-dynamic";

const Query = z.object({ language: z.string().optional() });
const tierOrder = { hold: 0, verify: 1, routine: 2 } as const;

/** Messages awaiting verification: hold tier first, then oldest first, optionally filtered by language. */
export const GET = get(Query, (ctx, q) => {
  const state = staffState(ctx, "interpreter", false);
  const langOf = new Map(state.visits.flatMap((v) => (v.activeSession ? [[v.activeSession.id, v.language] as const] : [])));
  const queue = state.messages
    .filter((m) => m.status === "awaiting_verifier")
    .map((m) => ({ ...m, language: langOf.get(m.sessionId) ?? null }))
    .filter((m) => !q.language || m.language === q.language)
    .sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.createdAt.localeCompare(b.createdAt));
  return { queue };
});
