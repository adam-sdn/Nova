import { post } from "@/lib/api";
import { ActorOnlyReq } from "@/lib/contracts";
import { callTriage } from "@/lib/state/service";

/** T3: nurse calls the patient to the triage desk. */
export const POST = post(ActorOnlyReq, (ctx, b, p: { id: string }) => callTriage(ctx, p.id, b.actor));
