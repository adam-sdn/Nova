import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { dismissFollowUp } from "@/lib/state/followups";

export const POST = post(ActorOnlyReq, async (ctx, b, p: { id: string }) => ({ followUp: dismissFollowUp(ctx, p.id, b.actor) }));
