import { post } from "@/lib/api";
import { RecheckMessageReq } from "@/lib/contracts";
import { recheckMessage } from "@/lib/state/service";

/** Edit and recheck: the doctor's new text runs through the translation agent again. */
export const POST = post(RecheckMessageReq, (ctx, b, p: { id: string; msgId: string }) => recheckMessage(ctx, p.id, p.msgId, b));
