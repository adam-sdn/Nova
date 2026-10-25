import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { closeVisit } from "@/lib/state/service";

/** Nurse ends a finished visit after the patient has their summary; the card leaves the board. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => closeVisit(ctx, p.id, b.actor));
