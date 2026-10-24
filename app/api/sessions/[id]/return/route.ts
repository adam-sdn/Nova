import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { returnToQueue } from "@/lib/state/service";

/** Doctor cancels a waiting session and returns the patient to the queue. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => returnToQueue(ctx, p.id, b.actor));
