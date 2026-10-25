import { describe, expect, it } from "vitest";
import { MESSAGE_STATUSES, VISIT_STATUSES, type MessageStatus } from "@/lib/contracts";
import * as svc from "@/lib/state/service";
import { patientState } from "@/lib/state/views";
import { appConfig } from "@/lib/config";
import {
  checkinFormErrors,
  enquiryBoxOpen,
  feelWorseVisible,
  statusText,
  STATUS_PHRASES_EN,
} from "@/components/patient/logic";
import { urgentWordingFor } from "@/components/patient/urgent";
import { checkinInput, doctor, nurse, testCtx } from "./helpers";

const signedNote = { sections: { Plan: "Synthetic plan" }, transcript: ["line one"], signed: true };

async function toConsultation(ctx: ReturnType<typeof testCtx>) {
  const c = await svc.checkin(ctx, checkinInput());
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 3, note: "Synthetic triage note" });
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  return { ...c, sessionId: session.id };
}

describe("patient check-in form (B5)", () => {
  const ok = { name: "Test Person", language: "en", reason: "Synthetic", consentContact: true, aiNoticeAccepted: true };
  it("is valid when every field is filled and both boxes are ticked", () => {
    expect(checkinFormErrors(ok)).toEqual([]);
  });
  it("requires consent to contact", () => {
    expect(checkinFormErrors({ ...ok, consentContact: false })).toContain("Consent to contact is required");
  });
  it("requires the automated-assistant notice, a name and a reason", () => {
    expect(checkinFormErrors({ ...ok, aiNoticeAccepted: false }).length).toBe(1);
    expect(checkinFormErrors({ ...ok, name: "  " }).length).toBe(1);
    expect(checkinFormErrors({ ...ok, reason: "" }).length).toBe(1);
  });
  it("the server refuses check-in without consent too", async () => {
    const ctx = testCtx();
    await expect(svc.checkin(ctx, { ...checkinInput(), consentContact: false })).rejects.toThrow(/Consent/);
  });
});

describe("enquiry box and I feel worse (D7, D8)", () => {
  it("enquiry box is open only in Triage Waiting, Triaged, Diagnostics and Awaiting Decision", () => {
    const open = VISIT_STATUSES.filter(enquiryBoxOpen);
    expect(open).toEqual(["triage_waiting", "triaged", "diagnostics", "awaiting_decision"]);
    expect(enquiryBoxOpen("consultation")).toBe(false);
    expect(enquiryBoxOpen("done")).toBe(false);
  });
  it("I feel worse is shown in every waiting state, not in session or after Done", () => {
    expect(VISIT_STATUSES.filter(feelWorseVisible)).toEqual([
      "arrival",
      "triage_waiting",
      "triaged",
      "diagnostics",
      "awaiting_decision",
    ]);
  });
  it("urgent wording is the fixed config text, falling back to English", () => {
    expect(urgentWordingFor("en")).toBe(appConfig.urgentText.en);
    expect(urgentWordingFor("xx")).toBe(appConfig.urgentText.en);
  });
  it("I feel worse creates an Urgent enquiry the nurse sees at once", async () => {
    const ctx = testCtx();
    const c = await svc.checkin(ctx, checkinInput());
    await svc.createEnquiry(ctx, { actor: { role: "patient", id: c.token }, visitId: c.visitId, kind: "feel_worse", text: "" });
    const { staffState } = await import("@/lib/state/views");
    const card = staffState(ctx, "nurse", false).visits.find((v) => v.id === c.visitId)!;
    expect(card.urgentEnquiry).toBe(true);
  });
});

describe("status feed phrases", () => {
  it("has one English phrase per status", () => {
    for (const s of VISIT_STATUSES) expect(statusText(s, []).length).toBeGreaterThan(3);
    expect(Object.keys(STATUS_PHRASES_EN).sort()).toEqual([...VISIT_STATUSES].sort());
  });
  it("prefers a verified phrase served by the patient state", () => {
    expect(statusText("triaged", [{ key: "status.triaged", text: "VERIFIED" }])).toBe("VERIFIED");
  });
});

describe("patient state only carries delivered doctor lines (F5)", () => {
  const notDelivered = MESSAGE_STATUSES.filter((s) => s !== "delivered");
  for (const status of notDelivered as MessageStatus[]) {
    it(`withholds a doctor line in state ${status}`, async () => {
      const ctx = testCtx();
      const c = await toConsultation(ctx);
      const { message } = await svc.createMessage(ctx, c.sessionId, {
        actor: doctor,
        direction: "doctor_to_patient",
        text: "Synthetic instruction",
      });
      ctx.db.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, message.id);
      const ps = patientState(ctx, c.token)!;
      expect(ps.messages).toEqual([]);
      expect(ps.pendingCount).toBe(1);
      expect(JSON.stringify(ps)).not.toContain("MOCK");
    });
  }
  it("shows a delivered line after the doctor's Send", async () => {
    const ctx = testCtx();
    const c = await toConsultation(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, {
      actor: doctor,
      direction: "doctor_to_patient",
      text: "Synthetic instruction",
    });
    await svc.sendMessage(ctx, c.sessionId, message.id, doctor);
    const ps = patientState(ctx, c.token)!;
    expect(ps.messages.map((m) => m.id)).toEqual([message.id]);
    expect(ps.pendingCount).toBe(0);
  });
});

describe("results pack (G2)", () => {
  it("shows preparing until the doctor releases", async () => {
    const ctx = testCtx();
    const c = await toConsultation(ctx);
    await svc.completeSession(ctx, c.sessionId, { actor: doctor, next: "decision", note: signedNote, tests: [] });
    await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: "r", advice: "a", medicines: [] });
    expect(patientState(ctx, c.token)).toMatchObject({ pack: null, packPreparing: true });
    await svc.verifyPack(ctx, c.visitId, doctor);
    expect(patientState(ctx, c.token)).toMatchObject({ pack: null, packPreparing: true });
    await svc.releasePack(ctx, c.visitId, doctor);
    const ps = patientState(ctx, c.token)!;
    expect(ps.packPreparing).toBe(false);
    expect(ps.pack?.content.whenToSeekHelp).toBe(appConfig.whenToSeekHelpText);
  });
});
