import { post } from "@/lib/api";
import { StartSessionReq } from "@/lib/contracts";
import { startSession } from "@/lib/state/service";

/** T7: doctor starts the session after the transcription consent check. */
export const POST = post(StartSessionReq, (ctx, b, p: { id: string }) => startSession(ctx, p.id, b));
