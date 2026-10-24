import { z } from "zod";
import { post } from "@/lib/api";
import { advanceTest } from "@/lib/state/seed";

/** Move the oldest unfinished Diagnostics test one state forward. */
export const POST = post(z.object({}), async (ctx) => ({ result: await advanceTest(ctx) }));
