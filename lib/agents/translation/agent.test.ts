import { describe, expect, it } from "vitest";
import * as svc from "@/lib/state/service";
import { patientState, staffState } from "@/lib/state/views";
import { loadChain, verifyAudit } from "@/lib/state/audit";
import { checkinInput, doctor, nurse, testCtx, type TestCtx } from "@/tests/helpers";
import { registerTranslationAgent } from "./index";

registerTranslationAgent();

async function inSession(ctx: TestCtx, language = "fr") {
  const c = await svc.checkin(ctx, checkinInput("Test Person One", language));
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 3, note: "Synthetic" });
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  return { ...c, sessionId: session.id };
}

describe("registered translation agent (F3, F4)", () => {
  it("a clean doctor line is ready_for_doctor with checks and trace; only Send delivers it", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "doctor_to_patient", text: "Take 100 mg paracetamol." });
    expect(message.status).toBe("ready_for_doctor");
    expect(message.tier).toBe("verify");
    expect(message.safety).toMatchObject({ passed: true });
    expect(message.aiChecks).toMatchObject({ passed: true });
    expect(message.trace).toMatchObject({ messageId: message.id, finalState: "ready_for_doctor" });
    expect(patientState(ctx, c.token).messages).toHaveLength(0);
    const sent = await svc.sendMessage(ctx, c.sessionId, message.id, doctor);
    expect(sent.message.status).toBe("delivered");
    expect(patientState(ctx, c.token).messages).toHaveLength(1);
    expect(verifyAudit(loadChain(ctx)).ok).toBe(true);
  });

  it("a consent message is held, cannot be sent, and escalation flags the nurse card", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "doctor_to_patient", text: "Please sign the consent form." });
    expect(message.status).toBe("held");
    await expect(svc.sendMessage(ctx, c.sessionId, message.id, doctor)).rejects.toMatchObject({ code: "wrong_status" });
    await svc.escalateMessage(ctx, c.sessionId, message.id, { actor: doctor, reason: "" });
    expect(staffState(ctx, "nurse").visits.find((v) => v.id === c.visitId)?.interpreterNeeded).toBe(true);
    expect(patientState(ctx, c.token).messages).toHaveLength(0);
  });

  it("a patient line is ai_checked", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: { role: "patient", id: c.token }, direction: "patient_to_doctor", text: "J'ai mal" });
    expect(message.status).toBe("ai_checked");
    expect(message.tier).toBeNull();
  });

  it("recheck reruns the pipeline", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "doctor_to_patient", text: "Please sign here." });
    const r = await svc.recheckMessage(ctx, c.sessionId, message.id, { actor: doctor, text: "How are you feeling?" });
    expect(r.message).toMatchObject({ status: "ready_for_doctor", tier: "routine" });
  });
});
