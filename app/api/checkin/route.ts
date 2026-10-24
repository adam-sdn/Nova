import { post } from "@/lib/api";
import { CheckinReq } from "@/lib/contracts";
import { checkin } from "@/lib/state/service";

/** T1 + T2: the patient checks in; registration moves the card to Triage Waiting. */
export const POST = post(CheckinReq, async (ctx, body) => {
  const r = await checkin(ctx, body);
  return { visitId: r.visitId, displayId: r.displayId, token: r.token };
});
