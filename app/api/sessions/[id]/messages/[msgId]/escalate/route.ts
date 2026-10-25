import "@/lib/agents/translation/register";
import { post } from "@/lib/api";
import { EscalateMessageReq } from "@/lib/contracts";
import { escalateMessage } from "@/lib/state/service";

/** Escalate to the hospital interpreter service: stays held, nurse card gets "Interpreter needed". */
export const POST = post(EscalateMessageReq, (ctx, b, p: { id: string; msgId: string }) => escalateMessage(ctx, p.id, p.msgId, b));
