import { post } from "@/lib/api";
import { TestUpdateReq } from "@/lib/contracts";
import { updateTest } from "@/lib/state/service";

/** T10: nurse, doctor or lab updates one test's state. */
export const POST = post(TestUpdateReq, (ctx, b, p: { id: string; testId: string }) => updateTest(ctx, p.id, p.testId, b));
