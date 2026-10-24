import { post } from "@/lib/api";
import { EnquiryReq } from "@/lib/contracts";
import { createEnquiry } from "@/lib/state/service";

/** Patient enquiry or "I feel worse". Stage 0 stub tiering; the rules live in lib/rules/enquiry (nurse worktree). */
export const POST = post(EnquiryReq, (ctx, b) => createEnquiry(ctx, b));
