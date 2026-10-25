import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { revealCode } from "@/lib/state/shift";

/** Tap to reveal on the nurse board. Each reveal is audited. */
export const POST = post(ActorOnlyReq, async (ctx, body) => ({ code: revealCode(ctx, body.actor) }));
