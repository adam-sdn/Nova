import { describe, expect, it } from "vitest";
import { VISIT_STATUSES } from "@/lib/contracts";
import { advanceTest, resetDemo, seedDemo, simulateArrival } from "@/lib/state/seed";
import { staffState } from "@/lib/state/views";
import { verifyAudit } from "@/lib/state/audit";
import { testCtx } from "./helpers";

/** The parts of the board that must be identical after every Reset + Seed (timestamps and tokens excluded). */
const snapshot = (ctx: ReturnType<typeof testCtx>) =>
  staffState(ctx, "nurse", true).visits.map((v) => ({
    displayId: v.displayId,
    name: v.name,
    initials: v.initials,
    language: v.language,
    status: v.status,
    priority: v.priority,
    tests: v.tests.map((t) => [t.name, t.state]),
    session: v.activeSession && [v.activeSession.doctorId, v.activeSession.state, v.activeSession.number],
    beingTriagedBy: v.beingTriagedBy,
    openEnquiries: v.openEnquiries,
  }));

describe("demo Reset and Seed (A2)", () => {
  it("gives the same starting board every time, with patients in all seven columns", async () => {
    const ctx = testCtx();
    await seedDemo(ctx);
    const first = snapshot(ctx);
    await simulateArrival(ctx);
    await advanceTest(ctx);
    await seedDemo(ctx);
    expect(snapshot(ctx)).toEqual(first);
    expect(new Set(first.map((v) => v.status))).toEqual(new Set(VISIT_STATUSES));
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });

  it("includes an escort request, a patient being triaged, and two patients with the same initials", async () => {
    const ctx = testCtx();
    await seedDemo(ctx);
    const board = snapshot(ctx);
    expect(board.some((v) => v.session?.[1] === "waiting")).toBe(true);
    expect(board.some((v) => v.beingTriagedBy)).toBe(true);
    const aa = board.filter((v) => v.initials === "AA");
    expect(aa).toHaveLength(2);
    expect(aa[0].displayId).not.toBe(aa[1].displayId);
  });

  it("Reset empties the board", async () => {
    const ctx = testCtx();
    await seedDemo(ctx);
    resetDemo(ctx);
    expect(staffState(ctx, "nurse", false).visits).toEqual([]);
  });

  it("simulate arrival adds a card in To Do; advance test moves a test forward", async () => {
    const ctx = testCtx();
    await seedDemo(ctx);
    const a = await simulateArrival(ctx);
    expect(a.visit.status).toBe("arrival");
    const r = await advanceTest(ctx);
    expect(r?.visit.tests.map((t) => t.state)).toEqual(["done", "ordered"]);
  });
});
