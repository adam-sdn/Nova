import { post } from "@/lib/api";
import { TriageReq } from "@/lib/contracts";
import { completeTriage } from "@/lib/state/service";

/** T4: nurse completes triage with a priority. */
export const POST = post(TriageReq, (ctx, b, p: { id: string }) => completeTriage(ctx, p.id, b));
