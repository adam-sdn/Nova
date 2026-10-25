import { NextResponse } from "next/server";
import { loadProfile } from "@/lib/agents/doctor/profile";
import { getCtx } from "@/lib/state/db";

/** Doctor profile panel: reason for visit in the patient's words and the triage note. Read-only. */
export async function GET(req: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params;
  const viewer = (new URL(req.url).searchParams.get("doctor") ?? "doctor").slice(0, 40);
  const profile = loadProfile(getCtx(), id, `doctor:${viewer}`);
  if (!profile) return NextResponse.json({ error: { code: "not_found", message: "Visit not found" } }, { status: 404 });
  return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
}
