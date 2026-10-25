import { post } from "@/lib/api";
import { EnquiryReq } from "@/lib/contracts";
import { createEnquiry } from "@/lib/state/service";
import { urgentWordingFor } from "@/components/patient/urgent";

/**
 * Patient enquiry or "I feel worse". The server sets tier urgent for feel_worse; rules live in lib/rules/enquiry
 * (nurse worktree). For feel_worse the response also carries the fixed clinician wording (hard rule 5).
 */
export const POST = post(EnquiryReq, async (ctx, b) => {
  const r = await createEnquiry(ctx, b);
  if (b.kind !== "feel_worse") return r;
  return { ...r, urgentText: urgentWordingFor(r.enquiry.originalLang) };
});
