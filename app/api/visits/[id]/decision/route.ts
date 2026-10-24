import { post } from "@/lib/api";
import { DecisionReq } from "@/lib/contracts";
import { recordDecision } from "@/lib/state/service";

/** T11: doctor records Discharge or Admit; the AI drafts the results pack from what was entered. */
export const POST = post(DecisionReq, (ctx, b, p: { id: string }) => recordDecision(ctx, p.id, b));
