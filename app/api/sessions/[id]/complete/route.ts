import { post } from "@/lib/api";
import { CompleteSessionReq } from "@/lib/contracts";
import { draftFollowUps } from "@/lib/state/followups";
import { completeSession } from "@/lib/state/service";

/** T8 / T9: doctor signs the note and sends for tests or to decision. Then AI drafts follow-ups to confirm. */
export const POST = post(CompleteSessionReq, async (ctx, b, p: { id: string }) => {
  const done = await completeSession(ctx, p.id, b);
  let followUps: Awaited<ReturnType<typeof draftFollowUps>> = [];
  try {
    followUps = await draftFollowUps(ctx, p.id);
  } catch (e) {
    // The consultation is already complete; a failed draft only means no suggestions.
    console.error("[follow-ups] draft failed:", e instanceof Error ? e.message : "unknown");
  }
  return { ...done, followUps };
});
