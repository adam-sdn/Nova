import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { releasePack } from "@/lib/state/service";

/** T12: doctor releases the verified pack to the patient. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => releasePack(ctx, p.id, b.actor));
