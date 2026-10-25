import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { closeShift } from "@/lib/state/shift";

/** A nurse ends the session. Its code stops working and joined doctors are sent back to the join screen. */
export const POST = post(ActorOnlyReq, async (ctx, body) => {
  closeShift(ctx, body.actor);
  return { ok: true };
});
