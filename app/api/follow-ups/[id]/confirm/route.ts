import { post } from "@/lib/api";
import { ConfirmFollowUpReq } from "@/lib/contracts";
import { confirmFollowUp } from "@/lib/state/followups";

/** The doctor confirms an AI-drafted follow-up, optionally rewording it. */
export const POST = post(ConfirmFollowUpReq, async (ctx, b, p: { id: string }) => ({ followUp: confirmFollowUp(ctx, p.id, b) }));
