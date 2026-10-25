import { get, notFound } from "@/lib/api";
import { StateQuery } from "@/lib/contracts";
import { requireCode } from "@/lib/state/shift";
import { patientState, staffState } from "@/lib/state/views";

export const dynamic = "force-dynamic";

/** The live view each window polls every 1 to 2 seconds. */
export const GET = get(StateQuery, (ctx, q) => {
  if (q.role === "patient") {
    if (!q.id) notFound("Patient token is required");
    return patientState(ctx, q.id) ?? notFound("Visit not found");
  }
  // Doctors see the board only while they hold the open session's code.
  if (q.role === "doctor") requireCode(ctx, q.code);
  return staffState(ctx, q.role, q.names === "1", q.id ?? q.role);
});
