// Follow-ups: AI drafts them after a consultation, the doctor confirms, edits, dismisses or marks them done.
import { describe, expect, it } from "vitest";
import type { AiAdapter } from "@/lib/ai";
import { mockAdapter } from "@/lib/ai.fixtures";
import * as svc from "@/lib/state/service";
import { completeFollowUp, confirmFollowUp, dismissFollowUp, draftFollowUps, draftNote, listFollowUps } from "@/lib/state/followups";
import { patientState } from "@/lib/state/views";
import { verifyAudit } from "@/lib/state/audit";
import { checkinInput, doctor, doctor2, nurse, testCtx, type TestCtx } from "./helpers";

const NAME = "Test Person Followup";

async function inSession(ctx: TestCtx) {
  const c = await svc.checkin(ctx, checkinInput(NAME));
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 2, note: "Synthetic triage note" });
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  return { visitId: c.visitId, token: c.token, sessionId: session.id };
}

async function completed(ctx: TestCtx) {
  const s = await inSession(ctx);
  const note = { sections: { History: "Synthetic", Plan: `Recheck in 2 hours, ${NAME}` }, transcript: [], signed: true };
  await svc.completeSession(ctx, s.sessionId, { actor: doctor, next: "tests", note, tests: ["Bloods (demo)"] });
  return { ...s, drafts: await draftFollowUps(ctx, s.sessionId) };
}

async function rejected(p: unknown) {
  const e = await Promise.resolve()
    .then(() => (typeof p === "function" ? p() : p))
    .then(() => null, (x) => x);
  expect(e).toBeInstanceOf(svc.TransitionError);
  return e as svc.TransitionError;
}

describe("follow-ups", () => {
  it("are drafted as suggestions from the signed note and the tests ordered", async () => {
    const ctx = testCtx();
    const { drafts } = await completed(ctx);
    expect(drafts.map((d) => d.text)).toEqual(["Review result: Bloods (demo)", `Follow up: Recheck in 2 hours, ${NAME}`]);
    expect(drafts.every((d) => d.status === "suggested")).toBe(true);
    expect(listFollowUps(ctx, doctor.id)).toHaveLength(2);
    expect(listFollowUps(ctx, doctor2.id)).toHaveLength(0);
  });

  it("the AI never sees the patient's name, and the text is stored encrypted", async () => {
    const seen: string[] = [];
    const spy: AiAdapter = { complete: (t, i, m) => (seen.push(i), mockAdapter.complete(t, i, m)) };
    const ctx = testCtx({ adapter: spy });
    const { drafts } = await completed(ctx);
    expect(seen.join("\n")).not.toContain(NAME);
    expect(drafts[1].text).toContain(NAME);
    expect(JSON.stringify(ctx.db.prepare("SELECT * FROM follow_ups").all())).not.toContain("Recheck");
  });

  it("the doctor confirms (optionally rewording), then marks done; or dismisses", async () => {
    const ctx = testCtx();
    const { drafts } = await completed(ctx);
    const [a, b] = drafts;
    await rejected(() => completeFollowUp(ctx, a.id, doctor)); // must be confirmed first
    expect(confirmFollowUp(ctx, a.id, { actor: doctor, text: "Chase bloods at 14:00" }).text).toBe("Chase bloods at 14:00");
    expect(completeFollowUp(ctx, a.id, doctor).status).toBe("done");
    expect(dismissFollowUp(ctx, b.id, doctor).status).toBe("dismissed");
    expect(listFollowUps(ctx, doctor.id).map((f) => f.id)).toEqual([a.id]);
  });

  it("only the doctor who saw the patient can act on it; nurses cannot", async () => {
    const ctx = testCtx();
    const { drafts } = await completed(ctx);
    expect((await rejected(() => confirmFollowUp(ctx, drafts[0].id, { actor: doctor2 }))).code).toBe("forbidden_role");
    expect((await rejected(() => dismissFollowUp(ctx, drafts[0].id, nurse))).code).toBe("forbidden_role");
  });

  it("are never shown to the patient", async () => {
    const ctx = testCtx();
    const { token } = await completed(ctx);
    expect(JSON.stringify(patientState(ctx, token))).not.toContain("Review result");
  });

  it("every step is audited and the chain verifies", async () => {
    const ctx = testCtx();
    const { drafts } = await completed(ctx);
    confirmFollowUp(ctx, drafts[0].id, { actor: doctor });
    completeFollowUp(ctx, drafts[0].id, doctor);
    dismissFollowUp(ctx, drafts[1].id, doctor);
    const actions = (ctx.db.prepare("SELECT action FROM audit").all() as { action: string }[]).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["follow_up.suggest", "follow_up.confirm", "follow_up.done", "follow_up.dismissed"]));
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });
});

describe("AI note draft", () => {
  it("fills each template section with its source lines, for the doctor in the session only", async () => {
    const ctx = testCtx();
    const { sessionId } = await inSession(ctx);
    const transcript = ["Pain started this morning", "No fever"];
    const { draft } = await draftNote(ctx, sessionId, { actor: doctor, sections: ["History", "Plan"], transcript });
    expect(draft.History).toEqual({ text: "Pain started this morning", fromLine: 1, toLine: 1 });
    expect((await rejected(() => draftNote(ctx, sessionId, { actor: doctor2, sections: ["Plan"], transcript }))).code).toBe("forbidden_role");
  });
});
