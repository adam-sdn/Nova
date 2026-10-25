import { post } from "@/lib/api";
import { JoinSessionReq } from "@/lib/contracts";
import { requireCode } from "@/lib/state/shift";

/** Checks a session code typed by a doctor or carried by the patient link. */
export const POST = post(JoinSessionReq, async (ctx, body) => {
  requireCode(ctx, body.code);
  return { ok: true };
});
