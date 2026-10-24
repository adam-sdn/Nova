import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { verifyPack } from "@/lib/state/service";

/** The interpreter verifies the pack translation (the doctor may, for an English pack). */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => verifyPack(ctx, p.id, b.actor));
