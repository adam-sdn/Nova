// Doctor flow against the real service and status machine (C3, C5, E3, E4, C8, E7).
import { describe, expect, it } from "vitest";
import * as svc from "@/lib/state/service";
import { staffState } from "@/lib/state/views";
import { readyQueue } from "@/lib/agents/doctor/board";
import { loadProfile } from "@/lib/agents/doctor/profile";
import { checkinInput, doctor, doctor2, nurse, testCtx, type TestCtx } from "./helpers";

const unsigned = { sections: { Plan: "x" }, transcript: [], signed: false };
const signed = { ...unsigned, signed: true };

async function triaged(ctx: TestCtx, name: string, priority: number) {
  const c = await svc.checkin(ctx, checkinInput(name));
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority, note: "Synthetic triage note" });
  return c.visitId;
}

async function rejected(p: Promise<unknown>) {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(svc.TransitionError);
  return e as svc.TransitionError;
}

describe("doctor flow", () => {
  it("C3: ready queue from staff state sorted by priority then wait", async () => {
    const ctx = testCtx();
    const a = await triaged(ctx, "Test Person One", 3);
    ctx.advance(5);
    const b = await triaged(ctx, "Test Person Two", 2);
    ctx.advance(5);
    const c = await triaged(ctx, "Test Person Three", 2);
    const q = readyQueue(staffState(ctx, "doctor", false).visits);
    expect(q.map((v) => v.id)).toEqual([b, c, a]);
  });

  it("C5: two doctors cannot claim the same patient", async () => {
    const ctx = testCtx();
    const v = await triaged(ctx, "Test Person One", 2);
    await svc.consultNow(ctx, v, doctor);
    await rejected(svc.consultNow(ctx, v, doctor2));
    expect(readyQueue(staffState(ctx, "doctor", false).visits)).toHaveLength(0);
  });

  it("E3/E4: start needs nurse confirmation and transcription consent; return puts back in queue", async () => {
    const ctx = testCtx();
    const v = await triaged(ctx, "Test Person One", 2);
    const { session } = await svc.consultNow(ctx, v, doctor);
    expect((await rejected(svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true }))).code).toBe("wrong_status");
    await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
    await rejected(svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: false }));
    const r = await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
    expect(r.session.state).toBe("in_session");

    const v2 = await triaged(ctx, "Test Person Two", 3);
    const s2 = (await svc.consultNow(ctx, v2, doctor2)).session;
    await svc.returnToQueue(ctx, s2.id, doctor2);
    expect(readyQueue(staffState(ctx, "doctor", false).visits).map((x) => x.id)).toEqual([v2]);
  });

  it("C8/E7: complete needs a signed note; tests go to diagnostics, decision to awaiting_decision", async () => {
    const ctx = testCtx();
    for (const next of ["tests", "decision"] as const) {
      const v = await triaged(ctx, `Test Person ${next}`, 2);
      const { session } = await svc.consultNow(ctx, v, doctor);
      await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
      await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
      const tests = next === "tests" ? ["Bloods", "ECG"] : [];
      await rejected(svc.completeSession(ctx, session.id, { actor: doctor, next, note: unsigned, tests }));
      const r = await svc.completeSession(ctx, session.id, { actor: doctor, next, note: signed, tests });
      expect(r.visit.status).toBe(next === "tests" ? "diagnostics" : "awaiting_decision");
      if (next === "tests") expect(r.visit.tests.map((t) => t.name)).toEqual(["Bloods", "ECG"]);
    }
  });

  it("E2: profile gives the reason in the patient's words and the triage note", async () => {
    const ctx = testCtx();
    const v = await triaged(ctx, "Test Person One", 2);
    const p = loadProfile(ctx, v)!;
    expect(p.reason.original).toBe("Synthetic reason for visit");
    expect(p.triageNote).toBe("Synthetic triage note");
    expect(loadProfile(ctx, "nope")).toBeNull();
  });
});
