import { NextResponse } from "next/server";
import { getCtx } from "@/lib/state/db";
import type { VisitStatus } from "@/lib/contracts";

// Helper endpoint to set up a patient in consultation stage for testing the voice feature
export async function POST() {
  try {
    const ctx = getCtx();

    // Get the first patient (usually A-102 after a simulated arrival)
    const visit = ctx.db
      .prepare("SELECT id FROM visits WHERE status != ? AND status != ? ORDER BY id LIMIT 1")
      .get("done", "awaiting_decision") as { id: string } | undefined;

    if (!visit) {
      return NextResponse.json({ error: { message: "No patient found to set up" } }, { status: 404 });
    }

    // Transition the patient to consultation status
    const newStatus: VisitStatus = "consultation";
    ctx.db.prepare("UPDATE visits SET status = ? WHERE id = ?").run(newStatus, visit.id);

    return NextResponse.json({
      success: true,
      visitId: visit.id,
      newStatus,
      message: "Patient set up in consultation stage. Join the session and click on this patient to test voice.",
    });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json({ error: { message: "Failed to set up patient" } }, { status: 500 });
  }
}
