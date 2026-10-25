import { get } from "@/lib/api";
import { FollowUpQuery } from "@/lib/contracts";
import { listFollowUps } from "@/lib/state/followups";
import { requireCode } from "@/lib/state/shift";

export const dynamic = "force-dynamic";

/** The doctor's follow-up list. Needs the open session's code, like the doctor board. */
export const GET = get(FollowUpQuery, (ctx, q) => {
  requireCode(ctx, q.code);
  return { followUps: listFollowUps(ctx, q.doctor) };
});
