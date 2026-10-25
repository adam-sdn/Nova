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
  aiChecks: null,
  trace: null,
  confirmedBy: status === "delivered" ? "D-05" : null,
  confirmedAt: null,
  escalatedAt: null,
  attestation: null,
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

  it("shows only delivered lines; drafted, checked, ready_for_doctor, flagged, held and escalated stay pending", () => {
    const hidden: MessageStatus[] = ["drafted", "checked", "ready_for_doctor", "flagged", "held", "escalated"];
    const out = getPatientVisibleContent({ ...base, messages: [...hidden.map((s) => msg(s)), msg("delivered")] });
    const text = JSON.stringify(out);
    for (const s of hidden) expect(text).not.toContain(`${SECRET}-${s}`);
    expect(out.messages.map((m) => m.id)).toEqual(["m-delivered"]);
    expect(out.pendingCount).toBe(hidden.length);
  });

  it("shows the patient's own lines as typed, never a translation", () => {
    const out = getPatientVisibleContent({ ...base, messages: [msg("drafted", "patient_to_doctor")] });
    expect(out.messages).toEqual([
      { id: "m-drafted", direction: "patient_to_doctor", text: "Take two tablets" },
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
