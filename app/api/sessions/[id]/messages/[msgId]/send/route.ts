import { post } from "@/lib/api";
import { SendMessageReq } from "@/lib/contracts";
import { sendMessage } from "@/lib/state/service";

/** The doctor's Send after reading "The patient will read: <back-translation>". ready_for_doctor -> delivered only. */
export const POST = post(SendMessageReq, (ctx, b, p: { id: string; msgId: string }) => sendMessage(ctx, p.id, p.msgId, b.actor));
