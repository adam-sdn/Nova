import { z } from "zod";
import { post } from "@/lib/api";
import { resetDemo } from "@/lib/state/seed";

/** Wipe all visits and the audit log. */
export const POST = post(z.object({}), async (ctx) => {
  resetDemo(ctx);
  return { ok: true };
});
