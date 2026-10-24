import { z } from "zod";
import { post } from "@/lib/api";
import { seedDemo } from "@/lib/state/seed";

/** Reset, then seed synthetic patients across all seven columns. */
export const POST = post(z.object({}), async (ctx) => {
  await seedDemo(ctx);
  return { ok: true };
});
