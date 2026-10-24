import { post } from "@/lib/api";
import { EnquiryPriorityReq } from "@/lib/contracts";
import { setEnquiryTier } from "@/lib/state/service";

/** Nurse overrides an enquiry's tier. */
export const POST = post(EnquiryPriorityReq, (ctx, b, p: { id: string }) => setEnquiryTier(ctx, p.id, b));
