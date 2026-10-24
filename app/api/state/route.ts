import { get, notFound } from "@/lib/api";
import { StateQuery } from "@/lib/contracts";
import { patientState, staffState } from "@/lib/state/views";

export const dynamic = "force-dynamic";

/** The live view each window polls every 1 to 2 seconds. */
export const GET = get(StateQuery, (ctx, q) => {
  if (q.role === "patient") {
    if (!q.id) notFound("Patient token is required");
    return patientState(ctx, q.id) ?? notFound("Visit not found");
  }
  return staffState(ctx, q.role, q.names === "1", q.id ?? q.role);
});
