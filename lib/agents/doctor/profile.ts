// Server-only: the profile panel's extra fields (reason in the patient's words, triage note).
import { audit } from "@/lib/state/audit";
import { dec, decOrNull } from "@/lib/state/crypt";
import type { Ctx } from "@/lib/state/db";
import { getVisit } from "@/lib/state/repo";

export interface DoctorProfile {
  visitId: string;
  reason: { original: string; english: string; language: string };
  triageNote: string | null;
}

export function loadProfile(ctx: Ctx, visitId: string, viewer = "doctor"): DoctorProfile | null {
  const v = getVisit(ctx.db, visitId);
  if (!v) return null;
  const reason = JSON.parse(dec(ctx, "visits", v.id, "reason", v.reason_enc)) as DoctorProfile["reason"];
  const triageNote = decOrNull(ctx, "visits", v.id, "triage_note", v.triage_note_enc);
  audit(ctx, viewer, "data.decrypted", "profile", [v.id]);
  return { visitId: v.id, reason, triageNote };
}
