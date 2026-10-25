import { post } from "@/lib/api";
import { DraftNoteReq } from "@/lib/contracts";
import { draftNote } from "@/lib/state/followups";

/** AI fills the Clinical Assessment template from the conversation. A draft: the doctor reads, edits and signs. */
export const POST = post(DraftNoteReq, (ctx, b, p: { id: string }) => draftNote(ctx, p.id, b));
