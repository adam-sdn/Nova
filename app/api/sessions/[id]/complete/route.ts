import { post } from "@/lib/api";
import { CompleteSessionReq } from "@/lib/contracts";
import { completeSession } from "@/lib/state/service";

/** T8 / T9: doctor signs the note and sends for tests or to decision. */
export const POST = post(CompleteSessionReq, (ctx, b, p: { id: string }) => completeSession(ctx, p.id, b));
