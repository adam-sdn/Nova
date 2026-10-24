import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { register } from "@/lib/state/service";

/** T2 by hand: a nurse finishes a walk-in's registration. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => register(ctx, p.id, b.actor));
