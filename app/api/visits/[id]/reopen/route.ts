import { post } from "@/lib/api";
import { ReopenReq } from "@/lib/contracts";
import { reopen } from "@/lib/state/service";

/** T13: doctor orders more tests or asks for a second look (new session). */
export const POST = post(ReopenReq, (ctx, b, p: { id: string }) => reopen(ctx, p.id, b));
