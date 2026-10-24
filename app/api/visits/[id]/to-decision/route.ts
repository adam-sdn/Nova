import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { moveToDecision } from "@/lib/state/service";

/** T10: all results back; nurse or doctor moves the card to Awaiting Decision. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => moveToDecision(ctx, p.id, b.actor));
