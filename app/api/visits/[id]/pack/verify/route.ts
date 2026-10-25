import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { verifyPack } from "@/lib/state/service";

/** The doctor confirms the pack after its translation passed the translation agent's checks (G3). */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => verifyPack(ctx, p.id, b.actor));
