import { z } from "zod";
import { post } from "@/lib/api";
import { simulateArrival } from "@/lib/state/seed";

/** A synthetic walk-in appears in To Do (Arrival). */
export const POST = post(z.object({}), async (ctx) => {
  const r = await simulateArrival(ctx);
  return { displayId: r.displayId, visitId: r.visitId };
});
