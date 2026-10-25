import { post } from "@/lib/api";
import { MessageReq } from "@/lib/contracts";
import { createMessage } from "@/lib/state/service";

/** A line in the session; runs the translation agent (owner: translation worktree). */
export const POST = post(MessageReq, (ctx, b, p: { id: string }) => createMessage(ctx, p.id, b));
