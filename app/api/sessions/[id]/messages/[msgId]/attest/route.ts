import { post } from "@/lib/api";
import { AttestMessageReq } from "@/lib/contracts";
import { attestMessage } from "@/lib/state/service";

/** "Handled with interpreter service" or consent taken there: a recorded attestation with a reason. */
export const POST = post(AttestMessageReq, (ctx, b, p: { id: string; msgId: string }) => attestMessage(ctx, p.id, p.msgId, b));
