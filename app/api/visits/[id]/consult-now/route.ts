import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { consultNow } from "@/lib/state/service";

/** T5: doctor claims the patient; creates a waiting session and an escort request. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => consultNow(ctx, p.id, b.actor));
