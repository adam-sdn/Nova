import { z } from "zod";
import { get } from "@/lib/api";
import { verifyAudit } from "@/lib/state/audit";

export const dynamic = "force-dynamic";

/** Checks the stored audit hash chain (rehearsal step 10). */
export const GET = get(z.object({}), (ctx) => verifyAudit(ctx.db));
