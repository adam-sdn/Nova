// Enquiry priority suggestion for the nurse inbox. Pure functions.
import type { EnquiryTier } from "@/lib/contracts";

export type SuggestedTier = "urgent" | "high" | "routine";

const URGENT_WORDS = ["breath", "chest"];
const HIGH_WORDS = ["pain", "dizzy"];

/**
 * TODO(ai): replace this hardcoded keyword match with the AI classifier (via lib/ai.ts) once it is wired.
 * TODO(clinician): the real red-flag list and tier table. These keywords are the Stage 1 placeholder only.
 * A display suggestion only: it never lowers a tier the server set (see inboxTier).
 */
export function suggestEnquiryPriority(text: string): { tier: SuggestedTier; reason: string } {
  const t = text.toLowerCase();
  const urgent = URGENT_WORDS.find((w) => t.includes(w));
  if (urgent) return { tier: "urgent", reason: `Mentions "${urgent}". Suggest nurse review now.` };
  const high = HIGH_WORDS.find((w) => t.includes(w));
  if (high) return { tier: "high", reason: `Mentions "${high}". Suggest a re-check.` };
  return { tier: "routine", reason: "No keyword matched. Suggest a routine check-in." };
}

const RANK: Record<EnquiryTier, number> = { routine: 1, needs_review: 2, high: 3, urgent: 4 };

export const tierRank = (t: EnquiryTier): number => RANK[t];

/**
 * The tier the inbox files an enquiry under. A tier set by the server or by a nurse is kept as it is
 * (rule 4: never lowered, and the nurse override always wins). Only an unclassified `needs_review`
 * enquiry may be raised by the suggestion.
 */
export function inboxTier(server: EnquiryTier, suggestion: SuggestedTier): EnquiryTier {
  if (server !== "needs_review") return server;
  return RANK[suggestion] > RANK[server] ? suggestion : server;
}
