import { z } from "zod";
import { get, post } from "@/lib/api";
import { ActorOnlyReq, type ShiftStatus } from "@/lib/contracts";
import { connected } from "@/lib/live";
import { currentShift, openShift } from "@/lib/state/shift";

export const dynamic = "force-dynamic";

/** Whether a session is open and who is connected. Never returns the code. */
export const GET = get(z.object({}), (ctx): ShiftStatus => {
  const s = currentShift(ctx);
  return { open: !!s, openedBy: s?.openedBy ?? null, openedAt: s?.openedAt ?? null, connected: s ? connected() : [] };
});

/** A nurse starts the shift's session, or joins the one already open. */
export const POST = post(ActorOnlyReq, async (ctx, body) => openShift(ctx, body.actor));
