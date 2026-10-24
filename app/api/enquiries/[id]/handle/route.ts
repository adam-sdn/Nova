import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { handleEnquiry } from "@/lib/state/service";

/** Nurse marks an enquiry handled. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => handleEnquiry(ctx, p.id, b.actor));
