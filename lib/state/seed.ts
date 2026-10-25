// Demo controls: Reset, Seed, simulate an arrival, advance a test. Synthetic data only (CLAUDE.md rule 1).
// The seed drives every patient through the real service functions, so the board is always reachable
// by legal transitions and fully audited.
import type { Actor } from "@/lib/contracts";
import { audit } from "./audit";
import { withClock, type Ctx } from "./db";
import { RESET_TABLES } from "./schema";
import * as svc from "./service";
import { testsFor } from "./repo";

const NURSE: Actor = { role: "nurse", id: "N-01" };
const DEMO: Actor = { role: "demo", id: "presenter" };
const doc = (id: string): Actor => ({ role: "doctor", id });
const signed = { sections: { Plan: "Demo note" }, transcript: ["Demo line"], signed: true };

/** Made-up people. Two share the initials A.A. to show IDs keep them apart (B3). */
interface SeedPatient {
  name: string;
  language: string;
  reason: string;
  /** Minutes before now that they arrived. */
  arrivedAgo: number;
  to: "arrival" | "triage_waiting" | "being_triaged" | "triaged" | "escort" | "consultation" | "diagnostics" | "awaiting_decision" | "done";
  priority?: number;
  enquiry?: string;
}

export const SEED_PATIENTS: SeedPatient[] = [
  { name: "Grace Obi", language: "en", reason: "Twisted ankle (demo)", arrivedAgo: 2, to: "arrival" },
  { name: "Leila Haddad", language: "ar", reason: "ألم في البطن (demo)", arrivedAgo: 95, to: "escort", priority: 2 },
  { name: "Amina Ali", language: "ar", reason: "صداع (demo)", arrivedAgo: 40, to: "triage_waiting", enquiry: "How long will I wait?" },
  { name: "Adam Ali", language: "en", reason: "Cut on hand (demo)", arrivedAgo: 25, to: "being_triaged" },
  { name: "Tomasz Nowak", language: "pl", reason: "Ból pleców (demo)", arrivedAgo: 70, to: "triaged", priority: 3 },
  { name: "Daniel Reyes", language: "es", reason: "Fiebre (demo)", arrivedAgo: 120, to: "consultation", priority: 2 },
  { name: "Sara Ahmed", language: "ar", reason: "دوخة (demo)", arrivedAgo: 150, to: "diagnostics", priority: 3 },
  { name: "Peter Lund", language: "en", reason: "Chest discomfort (demo)", arrivedAgo: 180, to: "awaiting_decision", priority: 1 },
  { name: "Mei Chen", language: "en", reason: "Sprained wrist (demo)", arrivedAgo: 25, to: "done", priority: 4 },
];

export function resetDemo(ctx: Ctx): void {
  ctx.db.transaction(() => {
    for (const t of RESET_TABLES) ctx.db.prepare(`DELETE FROM ${t}`).run();
  })();
  ctx.decryptAuditAt.clear();
  audit(ctx, DEMO, "demo.reset", "demo");
}

async function walk(ctx: Ctx, p: SeedPatient) {
  const c = await svc.checkin(ctx, { name: p.name, language: p.language, consentContact: true, aiNoticeAccepted: true, reason: p.reason }, { register: p.to !== "arrival" });
  if (p.to === "arrival") return;
  const patient: Actor = { role: "patient", id: c.token };
  if (p.enquiry) await svc.createEnquiry(ctx, { actor: patient, visitId: c.visitId, kind: "message", text: p.enquiry });
  if (p.to === "triage_waiting") return;
  await svc.callTriage(ctx, c.visitId, NURSE);
  if (p.to === "being_triaged") return;
  await svc.completeTriage(ctx, c.visitId, { actor: NURSE, priority: p.priority ?? 3, note: "Demo triage note" });
  if (p.to === "triaged") return;
  const doctor = doc(p.to === "escort" ? "D-05" : "D-01");
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  if (p.to === "escort") return;
  await svc.escorted(ctx, session.id, { actor: NURSE, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  if (p.to === "consultation") return;
  if (p.to === "diagnostics") {
    const r = await svc.completeSession(ctx, session.id, { actor: doctor, next: "tests", note: signed, tests: ["Bloods (demo)", "X-ray (demo)"] });
    await svc.updateTest(ctx, c.visitId, r.visit.tests[0].id, { actor: NURSE, state: "in_progress" });
    return;
  }
  await svc.completeSession(ctx, session.id, { actor: doctor, next: "tests", note: signed, tests: ["Bloods (demo)"] });
  for (const t of testsFor(ctx.db, c.visitId)) await svc.updateTest(ctx, c.visitId, t.id, { actor: NURSE, state: "results_back" });
  await svc.moveToDecision(ctx, c.visitId, NURSE);
  if (p.to === "awaiting_decision") return;
  await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: "Demo results", advice: "Demo advice", medicines: [] });
}

/** Reset, then put synthetic patients in every column. Same board every time (A2). */
export async function seedDemo(ctx: Ctx): Promise<void> {
  resetDemo(ctx);
  const now = ctx.now().getTime();
  // Arrivals are backdated, but every ID comes from today's counter, even when that crosses midnight.
  const idCtx: Ctx = { ...ctx, idClock: () => new Date(now) };
  for (const p of SEED_PATIENTS) {
    // Each patient's steps happen at their arrival time plus one minute per step.
    let t = now - p.arrivedAgo * 60_000;
    await walk(withClock(idCtx, () => new Date((t += 60_000))), p);
  }
  audit(ctx, DEMO, "demo.seed", "demo", { patients: SEED_PATIENTS.length });
}

let arrivals = 0;
const ARRIVAL_NAMES = ["Noor Saleh", "Ivy Brooks", "Omar Farah", "Lena Kowalska", "Sam Patel"];

export async function simulateArrival(ctx: Ctx) {
  const name = ARRIVAL_NAMES[arrivals++ % ARRIVAL_NAMES.length];
  return svc.checkin(
    ctx,
    { name, language: "en", consentContact: true, aiNoticeAccepted: true, reason: "Simulated arrival (demo)" },
    { register: false },
  );
}

/** Move the oldest unfinished test of a Diagnostics visit one state forward. */
export async function advanceTest(ctx: Ctx) {
  const order = ["ordered", "in_progress", "done", "results_back"] as const;
  const row = ctx.db
    .prepare(
      `SELECT t.id, t.visit_id, t.state FROM tests t JOIN visits v ON v.id = t.visit_id
       WHERE v.status = 'diagnostics' AND t.state != 'results_back' ORDER BY t.created_at, t.rowid LIMIT 1`,
    )
    .get() as { id: string; visit_id: string; state: (typeof order)[number] } | undefined;
  if (!row) return null;
  const next = order[order.indexOf(row.state) + 1];
  return svc.updateTest(ctx, row.visit_id, row.id, { actor: DEMO, state: next });
}
