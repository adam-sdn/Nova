import { describe, expect, it } from "vitest";
import { checkCode, closeShift, currentShift, openShift, requireCode, revealCode, CODE_LENGTH } from "@/lib/state/shift";
import { resetDemo } from "@/lib/state/seed";
import { verifyAudit } from "@/lib/state/audit";
import { doctor, nurse, nurse2, testCtx } from "./helpers";

describe("shift sessions", () => {
  it("a nurse opens a session; a second nurse on the shift joins the same one", () => {
    const ctx = testCtx();
    expect(currentShift(ctx)).toBeNull();
    const a = openShift(ctx, nurse);
    const b = openShift(ctx, nurse2);
    expect(b.id).toBe(a.id);
    expect(currentShift(ctx)?.id).toBe(a.id);
  });

  it("only nurses can open, reveal or end a session", () => {
    const ctx = testCtx();
    expect(() => openShift(ctx, doctor)).toThrow(/nurse/);
    openShift(ctx, nurse);
    expect(() => revealCode(ctx, doctor)).toThrow(/nurse/);
    expect(() => closeShift(ctx, doctor)).toThrow(/nurse/);
  });

  it("the revealed code joins the session, in any case and with spaces; wrong codes do not", () => {
    const ctx = testCtx();
    const s = openShift(ctx, nurse);
    const code = revealCode(ctx, nurse);
    expect(code).toMatch(new RegExp(`^[A-Z2-9]{${CODE_LENGTH}}$`));
    expect(checkCode(ctx, code)?.id).toBe(s.id);
    expect(checkCode(ctx, ` ${code.slice(0, 3).toLowerCase()} ${code.slice(3)} `)?.id).toBe(s.id);
    expect(checkCode(ctx, "WRONG1")).toBeNull();
    expect(checkCode(ctx, "")).toBeNull();
    expect(() => requireCode(ctx, "WRONG1")).toThrow(/not valid/);
  });

  it("the code is never stored in plaintext", () => {
    const ctx = testCtx();
    openShift(ctx, nurse);
    const code = revealCode(ctx, nurse);
    const raw = JSON.stringify(ctx.db.prepare("SELECT * FROM shifts").all());
    expect(raw).not.toContain(code);
  });

  it("ending the session invalidates its code; the next session gets a new one", () => {
    const ctx = testCtx();
    openShift(ctx, nurse);
    const code = revealCode(ctx, nurse);
    closeShift(ctx, nurse);
    expect(currentShift(ctx)).toBeNull();
    expect(checkCode(ctx, code)).toBeNull();
    expect(() => revealCode(ctx, nurse)).toThrow(/No session/);
    expect(() => closeShift(ctx, nurse)).toThrow(/No session/);
    const next = openShift(ctx, nurse);
    expect(checkCode(ctx, revealCode(ctx, nurse))?.id).toBe(next.id);
  });

  it("demo Reset keeps the session open, so nobody is logged out mid-demo", () => {
    const ctx = testCtx();
    openShift(ctx, nurse);
    const code = revealCode(ctx, nurse);
    resetDemo(ctx);
    expect(checkCode(ctx, code)).not.toBeNull();
  });

  it("open, reveal and end are audited and the chain verifies", () => {
    const ctx = testCtx();
    openShift(ctx, nurse);
    revealCode(ctx, nurse);
    closeShift(ctx, nurse);
    const actions = (ctx.db.prepare("SELECT action FROM audit").all() as { action: string }[]).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["shift.open", "shift.reveal_code", "shift.close"]));
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });
});
