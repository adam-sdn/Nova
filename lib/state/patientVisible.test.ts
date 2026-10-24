import { describe, expect, it } from "vitest";
import {
  MESSAGE_STATUSES,
  PACK_STATUSES,
  VISIT_STATUSES,
  type MessageStatus,
  type MessageView,
  type PackStatus,
  type PackView,
} from "@/lib/contracts";
import { getPatientVisibleContent, PATIENT_VISIBLE_MESSAGE_STATUSES } from "./patientVisible";

const SECRET = "UNVERIFIED-AI-TEXT";

const msg = (status: MessageStatus, direction: MessageView["direction"] = "doctor_to_patient"): MessageView => ({
  id: `m-${status}`,
  sessionId: "s1",
  direction,
  source: "Take two tablets",
  translation: `${SECRET}-${status}`,
  backTranslation: "Take two tablets",
  tier: "verify",
  status,
  safety: null,
  verifiedBy: null,
  verifiedAt: null,
  createdAt: "2026-10-24T09:00:00Z",
});

const pack = (status: PackStatus): PackView => ({
  id: "p1",
  visitId: "v1",
  language: "ar",
  status,
  content: { results: `${SECRET}-pack`, advice: "a", medicines: [], whenToSeekHelp: "fixed" },
  releasedBy: null,
});

const base = { status: "consultation" as const, language: "ar", pack: null, phrases: {} };

describe("getPatientVisibleContent (F5)", () => {
  it.each(MESSAGE_STATUSES)("doctor line in status %s", (status) => {
    const out = getPatientVisibleContent({ ...base, messages: [msg(status)] });
    const shown = JSON.stringify(out).includes(`${SECRET}-${status}`);
    expect(shown).toBe(PATIENT_VISIBLE_MESSAGE_STATUSES.includes(status));
  });

  it("never shows drafted, checked, awaiting, or rejected lines", () => {
    const hidden: MessageStatus[] = ["drafted", "checked", "awaiting_verifier", "rejected"];
    const out = getPatientVisibleContent({ ...base, messages: hidden.map((s) => msg(s)) });
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out.messages).toEqual([]);
    expect(out.pendingCount).toBe(3); // rejected lines are not pending
  });

  it("labels routine lines as machine translated", () => {
    const out = getPatientVisibleContent({ ...base, messages: [msg("delivered_labelled"), msg("verified")] });
    expect(out.messages.map((m) => m.machineTranslated)).toEqual([true, false]);
  });

  it("shows the patient's own lines as typed, never a translation", () => {
    const out = getPatientVisibleContent({ ...base, messages: [msg("drafted", "patient_to_doctor")] });
    expect(out.messages).toEqual([
      { id: "m-drafted", direction: "patient_to_doctor", text: "Take two tablets", machineTranslated: false },
    ]);
  });

  it.each(PACK_STATUSES)("results pack in status %s", (status) => {
    const out = getPatientVisibleContent({ ...base, status: "done", messages: [], pack: pack(status) });
    expect(JSON.stringify(out).includes(`${SECRET}-pack`)).toBe(status === "released");
    expect(out.packPreparing).toBe(status !== "released");
  });

  it("serves only phrases that carry a verifier and a date (F6)", () => {
    const out = getPatientVisibleContent({
      ...base,
      messages: [],
      phrases: {
        ok: { ar: { text: "verified", verifiedBy: "Fluent Verifier", verifiedAt: "2026-10-20" } },
        noDate: { ar: { text: "no date", verifiedBy: "Fluent Verifier" } },
        noVerifier: { ar: { text: "no verifier", verifiedAt: "2026-10-20" } },
        otherLang: { en: { text: "english", verifiedBy: "x", verifiedAt: "2026-10-20" } },
      },
    });
    expect(out.phrases).toEqual([{ key: "ok", text: "verified" }]);
  });

  it.each(VISIT_STATUSES)("enquiry box open state for %s matches SPEC section 5", (status) => {
    const out = getPatientVisibleContent({ ...base, status, messages: [] });
    const open = ["triage_waiting", "triaged", "diagnostics", "awaiting_decision"].includes(status);
    expect(out.enquiriesOpen).toBe(open);
  });
});
