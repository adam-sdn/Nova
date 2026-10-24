import { describe, expect, it } from "vitest";
import * as svc from "@/lib/state/service";
import { TransitionError } from "@/lib/state/service";
import { loadChain, verifyAudit } from "@/lib/state/audit";
import { DISPLAY_ID_RE } from "@/lib/state/ids";
import { staffState } from "@/lib/state/views";
import { appConfig } from "@/lib/config";
import { checkinInput, doctor, doctor2, interpreter, nurse, nurse2, testCtx, type TestCtx } from "./helpers";

const signedNote = { sections: { Plan: "Synthetic plan" }, transcript: ["line one"], signed: true };

/** Walk a fresh patient to the given point using only service calls. */
async function toTriaged(ctx: TestCtx, name = "Test Person One") {
  const c = await svc.checkin(ctx, checkinInput(name));
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 3, note: "Synthetic triage note" });
  return c;
}

async function toConsultation(ctx: TestCtx) {
  const c = await toTriaged(ctx);
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  return { ...c, sessionId: session.id };
}

async function toAwaitingDecision(ctx: TestCtx) {
  const c = await toConsultation(ctx);
  await svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "decision", note: signedNote, tests: [] });
  return c;
}

const statusOf = (ctx: TestCtx, visitId: string) =>
  (ctx.db.prepare("SELECT status FROM visits WHERE id = ?").get(visitId) as { status: string }).status;

async function expectRejected(p: Promise<unknown>, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(TransitionError);
  if (code) expect((err as TransitionError).code).toBe(code);
  expect((err as TransitionError).message.length).toBeGreaterThan(5);
}

describe("check-in and IDs (T1, T2, B2, B5)", () => {
  it("issues A-### IDs that are unique, sequential and contain no personal data", async () => {
    const ctx = testCtx();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await svc.checkin(ctx, checkinInput(`Person ${i} Same`))).displayId);
    expect(ids).toEqual(["A-101", "A-102", "A-103", "A-104", "A-105"]);
    for (const id of ids) {
      expect(id).toMatch(DISPLAY_ID_RE);
      expect(id.toLowerCase()).not.toContain("person");
    }
  });

  it("never reuses an ID the same day, even after visits leave the board", async () => {
    const ctx = testCtx();
    const a = await svc.checkin(ctx, checkinInput());
    ctx.db.prepare("DELETE FROM visits WHERE id = ?").run(a.visitId); // even if a row disappeared
    const b = await svc.checkin(ctx, checkinInput());
    expect(b.displayId).not.toBe(a.displayId);
    expect(b.displayId).toBe("A-102");
  });

  it("restarts the sequence on a new day", async () => {
    const ctx = testCtx();
    await svc.checkin(ctx, checkinInput());
    ctx.advance(24 * 60);
    expect((await svc.checkin(ctx, checkinInput())).displayId).toBe("A-101");
  });

  it("registration moves To Do to Triage Waiting automatically", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    expect(statusOf(ctx, c.visitId)).toBe("triage_waiting");
  });

  it("a walk-in that has not finished registering stays in To Do until registered", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput(), { register: false });
    expect(statusOf(ctx, c.visitId)).toBe("arrival");
    await svc.register(ctx, c.visitId, nurse);
    expect(statusOf(ctx, c.visitId)).toBe("triage_waiting");
  });

  it("check-in cannot complete without consent to contact (B5)", async () => {
    const ctx = testCtx();
    await expectRejected(svc.checkin(ctx, { ...checkinInput(), consentContact: false }), "guard_failed");
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM visits").get()).toEqual({ n: 0 });
  });
});

describe("triage (T3, T4)", () => {
  it("only one nurse can claim a patient for triage", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    await svc.callTriage(ctx, c.visitId, nurse);
    await expectRejected(svc.callTriage(ctx, c.visitId, nurse2), "guard_failed");
    await expectRejected(svc.completeTriage(ctx, c.visitId, { actor: nurse2, priority: 2, note: "" }));
  });

  it("complete triage needs a priority in the scale and stores an AI summary", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    await expectRejected(svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 99, note: "" }));
    const r = await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 2, note: "n" });
    expect(r.visit.status).toBe("triaged");
    expect(r.visit.priority).toBe(2);
    expect(r.visit.summary?.summary).toContain("Mock summary");
  });
});

describe("claims and sessions (T5 to T9, C5, C11)", () => {
  it("two doctors cannot claim the same patient (C5)", async () => {
    const ctx = testCtx();
    const c = await toTriaged(ctx);
    await svc.consultNow(ctx, c.visitId, doctor);
    await expectRejected(svc.consultNow(ctx, c.visitId, doctor2), "guard_failed");
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM sessions").get()).toEqual({ n: 1 });
  });

  it("Can't find patient flags the card and returns the patient to the queue", async () => {
    const ctx = testCtx();
    const c = await toTriaged(ctx);
    const { session } = await svc.consultNow(ctx, c.visitId, doctor);
    const r = await svc.escorted(ctx, session.id, { actor: nurse, outcome: "not_found" });
    expect(r.visit.status).toBe("triaged");
    expect(r.visit.escortFlag).toBe(true);
    expect(r.visit.activeSession).toBeNull();
    // Another doctor may now call the patient.
    await svc.consultNow(ctx, c.visitId, doctor2);
  });

  it("Start session is refused until the nurse confirms, and needs transcription consent", async () => {
    const ctx = testCtx();
    const c = await toTriaged(ctx);
    const { session } = await svc.consultNow(ctx, c.visitId, doctor);
    await expectRejected(svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true }));
    await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
    expect(statusOf(ctx, c.visitId)).toBe("consultation");
    await expectRejected(svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: false }));
    await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  });

  it("Complete needs a signed note; send for tests lists each test", async () => {
    const ctx = testCtx();
    const c = await toConsultation(ctx);
    await expectRejected(
      svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "tests", note: { ...signedNote, signed: false }, tests: ["Bloods"] }),
    );
    await expectRejected(svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "tests", note: signedNote, tests: [] }));
    const r = await svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "tests", note: signedNote, tests: ["Bloods", "X-ray"] });
    expect(r.visit.status).toBe("diagnostics");
    expect(r.visit.tests.map((t) => [t.name, t.state])).toEqual([
      ["Bloods", "ordered"],
      ["X-ray", "ordered"],
    ]);
  });

  it("tests must all be back before moving to Awaiting Decision (T10)", async () => {
    const ctx = testCtx();
    const c = await toConsultation(ctx);
    const r = await svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "tests", note: signedNote, tests: ["Bloods", "ECG"] });
    const [t1, t2] = r.visit.tests;
    await svc.updateTest(ctx, c.visitId, t1.id, { actor: nurse, state: "results_back" });
    await expectRejected(svc.moveToDecision(ctx, c.visitId, nurse));
    await svc.updateTest(ctx, c.visitId, t2.id, { actor: nurse, state: "results_back" });
    expect((await svc.moveToDecision(ctx, c.visitId, nurse)).visit.status).toBe("awaiting_decision");
  });

  it("cards move backward and the session number increments (C11)", async () => {
    const ctx = testCtx();
    const c = await toAwaitingDecision(ctx);
    // More tests: back to Diagnostics.
    const more = await svc.reopen(ctx, c.visitId, { actor: doctor, kind: "more_tests", tests: ["CT"] });
    expect(more.visit.status).toBe("diagnostics");
    await svc.updateTest(ctx, c.visitId, more.visit.tests.find((t) => t.name === "CT")!.id, { actor: nurse, state: "results_back" });
    await svc.moveToDecision(ctx, c.visitId, doctor);
    // Second look: a new session numbered 2.
    const second = await svc.reopen(ctx, c.visitId, { actor: doctor, kind: "second_look", tests: [] });
    expect(second.visit.activeSession?.number).toBe(2);
    await svc.escorted(ctx, second.visit.activeSession!.id, { actor: nurse, outcome: "with_doctor" });
    expect(statusOf(ctx, c.visitId)).toBe("consultation");
  });

  it("a cancelled escort does not count as a consultation", async () => {
    const ctx = testCtx();
    const c = await toTriaged(ctx);
    const first = await svc.consultNow(ctx, c.visitId, doctor);
    await svc.escorted(ctx, first.session.id, { actor: nurse, outcome: "not_found" });
    const again = await svc.consultNow(ctx, c.visitId, doctor);
    expect(again.session.number).toBe(1);
  });
});

describe("decision, pack and retention (T11 to T14, C10, C12)", () => {
  it("only a doctor can record a decision (C10)", async () => {
    const ctx = testCtx();
    const c = await toAwaitingDecision(ctx);
    await expectRejected(
      svc.recordDecision(ctx, c.visitId, { actor: nurse, outcome: "discharge", results: "", advice: "", medicines: [] }),
      "forbidden_role",
    );
    const r = await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: "r", advice: "a", medicines: [] });
    expect(r.visit.status).toBe("done");
    expect(r.visit.decision).toBe("discharge");
  });

  it("release needs a verified pack and a doctor", async () => {
    const ctx = testCtx();
    const c = await toAwaitingDecision(ctx);
    await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "admit", results: "r", advice: "a", medicines: ["x"] });
    await expectRejected(svc.releasePack(ctx, c.visitId, doctor), "guard_failed");
    await svc.verifyPack(ctx, c.visitId, interpreter);
    await expectRejected(svc.releasePack(ctx, c.visitId, nurse), "forbidden_role");
    const r = await svc.releasePack(ctx, c.visitId, doctor);
    expect(r.pack.status).toBe("released");
    expect(r.pack.content.whenToSeekHelp).toBe(appConfig.whenToSeekHelpText);
  });

  it("Done cards leave the board after doneRetentionMinutes but stay in the audit log (C12)", async () => {
    const ctx = testCtx();
    const c = await toAwaitingDecision(ctx);
    await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: "", advice: "", medicines: [] });
    const onBoard = () => staffState(ctx, "nurse", false).visits.some((v) => v.id === c.visitId);
    expect(onBoard()).toBe(true);
    ctx.advance(appConfig.doneRetentionMinutes - 1);
    expect(onBoard()).toBe(true);
    ctx.advance(2);
    expect(onBoard()).toBe(false);
    expect(loadChain(ctx.db).some((e) => e.refId === c.visitId && e.action === "visit.record_decision")).toBe(true);
  });
});

describe("enquiries (stubs; rules are built in the nurse worktree)", () => {
  it("is open in the waiting-area states only", async () => {
    const ctx = testCtx();
    const c = await toConsultation(ctx);
    await expectRejected(
      svc.createEnquiry(ctx, { actor: { role: "patient", id: c.token }, visitId: c.visitId, kind: "message", text: "hello" }),
    );
  });

  it("refuses a patient token that does not match the visit", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    await expectRejected(
      svc.createEnquiry(ctx, { actor: { role: "patient", id: "wrong" }, visitId: c.visitId, kind: "message", text: "hi" }),
    );
  });

  it("I feel worse is always Urgent; the nurse can override and mark handled", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    const patient = { role: "patient" as const, id: c.token };
    const worse = await svc.createEnquiry(ctx, { actor: patient, visitId: c.visitId, kind: "feel_worse", text: "" });
    expect(worse.enquiry.tier).toBe("urgent");
    const msg = await svc.createEnquiry(ctx, { actor: patient, visitId: c.visitId, kind: "message", text: "How long?" });
    const set = await svc.setEnquiryTier(ctx, msg.enquiry.id, { actor: nurse, tier: "routine" });
    expect(set.enquiry.tier).toBe("routine");
    const done = await svc.handleEnquiry(ctx, msg.enquiry.id, nurse);
    expect(done.enquiry.status).toBe("handled");
  });
});

describe("audit (H4, H5)", () => {
  it("writes an entry for every transition, holding hashes and never plaintext", async () => {
    const ctx = testCtx();
    const name = "Unique Synthetic Name";
    const c = await svc.checkin(ctx, { ...checkinInput(name), reason: "very distinctive reason text" });
    await svc.callTriage(ctx, c.visitId, nurse);
    await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 1, note: "distinctive triage note" });
    const actions = loadChain(ctx.db).filter((e) => e.refId === c.visitId).map((e) => e.action);
    expect(actions).toEqual(["visit.checkin", "visit.register", "visit.call_triage", "visit.complete_triage"]);
    const raw = JSON.stringify(ctx.db.prepare("SELECT * FROM audit").all());
    for (const secret of ["Unique", "Synthetic Name", "distinctive"]) expect(raw).not.toContain(secret);
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });

  it("rejected transitions do not write anything", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    const before = loadChain(ctx.db).length;
    await expectRejected(svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "admit", results: "", advice: "", medicines: [] }));
    expect(loadChain(ctx.db).length).toBe(before);
  });

  it("detects an edited or deleted entry in the stored chain", async () => {
    const ctx = testCtx();
    await toTriaged(ctx);
    ctx.db.prepare("UPDATE audit SET actor = 'nurse:someone-else' WHERE seq = 1").run();
    expect(verifyAudit(ctx.db)).toMatchObject({ ok: false, brokenAt: 1 });
    const ctx2 = testCtx();
    await toTriaged(ctx2);
    ctx2.db.prepare("DELETE FROM audit WHERE seq = 1").run();
    expect(verifyAudit(ctx2.db).ok).toBe(false);
  });
});
