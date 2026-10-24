import { post } from "@/lib/api";
import { VerifyMessageReq } from "@/lib/contracts";
import { verifyMessage } from "@/lib/state/service";

/** Interpreter verifies, edits or rejects a line. Hold tier needs the typed confirmation. */
export const POST = post(VerifyMessageReq, (ctx, b, p: { messageId: string }) => verifyMessage(ctx, p.messageId, b));
