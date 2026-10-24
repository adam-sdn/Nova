import { post } from "@/lib/api";
import { EscortedReq } from "@/lib/contracts";
import { escorted } from "@/lib/state/service";

/** T6: nurse confirms the patient is with the doctor, or reports Can't find patient. */
export const POST = post(EscortedReq, (ctx, b, p: { id: string }) => escorted(ctx, p.id, b));
