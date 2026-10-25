import { post } from "@/lib/api";
import { CheckinWithCodeReq } from "@/lib/contracts";
import { checkin } from "@/lib/state/service";
import { requireCode } from "@/lib/state/shift";

/** T1 + T2: the patient checks in to the open session; registration moves the card to Triage Waiting. */
export const POST = post(CheckinWithCodeReq, async (ctx, { sessionCode, ...body }) => {
  requireCode(ctx, sessionCode);
  const r = await checkin(ctx, body);
  return { visitId: r.visitId, displayId: r.displayId, token: r.token };
});
