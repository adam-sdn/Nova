import { describe, expect, it } from "vitest";
import { VISIT_STATUSES, type Actor, type Role, type VisitStatus } from "@/lib/contracts";
import { RULES, check, checkCheckin, type GuardFacts, type TransitionName } from "./machine";

const actor = (role: Role, id = `${role}-1`): Actor => ({ role, id });
const nurse = actor("nurse", "N-01");
const doctor = actor("doctor", "D-05");
const scale = { min: 1, max: 5 };

/** Facts that satisfy every guard of a transition, so each test can break exactly one thing. */
const happy: Record<TransitionName, GuardFacts> = {
  register: { status: "arrival", actor: actor("system", "auto") },
  call_triage: { status: "triage_waiting", actor: nurse },
  complete_triage: { status: "triage_waiting", actor: nurse, priority: 3, priorityScale: scale },
  consult_now: { status: "triaged", actor: doctor, activeSession: null },
  escort_confirm: { status: "triaged", actor: nurse, activeSession: { doctorId: "D-05", state: "waiting" } },
  escort_not_found: { status: "triaged", actor: nurse, activeSession: { doctorId: "D-05", state: "waiting" } },
  return_to_queue: { status: "triaged", actor: doctor, activeSession: { doctorId: "D-05", state: "waiting" } },
  start_session: {
    status: "consultation",
    actor: doctor,
    activeSession: { doctorId: "D-05", state: "ready" },
    transcriptionConsent: true,
  },
  complete_to_tests: {
    status: "consultation",
    actor: doctor,
    activeSession: { doctorId: "D-05", state: "in_session" },
    noteSigned: true,
    testsToOrder: 1,
  },
  complete_to_decision: {
    status: "consultation",
    actor: doctor,
    activeSession: { doctorId: "D-05", state: "in_session" },
    noteSigned: true,
  },
  update_test: { status: "diagnostics", actor: nurse },
  move_to_decision: { status: "diagnostics", actor: nurse, tests: ["results_back", "results_back"] },
  record_decision: { status: "awaiting_decision", actor: doctor, decision: "discharge" },
  verify_pack: { status: "done", actor: actor("interpreter", "I-01"), packStatus: "draft", packLanguage: "ar" },
  release_pack: { status: "done", actor: doctor, packStatus: "verified" },
  order_more_tests: { status: "awaiting_decision", actor: doctor, testsToOrder: 2 },
  second_look: { status: "awaiting_decision", actor: doctor, activeSession: null },
};

const expectedTo: Record<TransitionName, VisitStatus> = {
  register: "triage_waiting",
  call_triage: "triage_waiting",
  complete_triage: "triaged",
  consult_now: "triaged",
  escort_confirm: "consultation",
  escort_not_found: "triaged",
  return_to_queue: "triaged",
  start_session: "consultation",
  complete_to_tests: "diagnostics",
  complete_to_decision: "awaiting_decision",
  update_test: "diagnostics",
  move_to_decision: "awaiting_decision",
  record_decision: "done",
  verify_pack: "done",
  release_pack: "done",
  order_more_tests: "diagnostics",
  second_look: "awaiting_decision",
};

const names = Object.keys(RULES) as TransitionName[];
const allRoles: Role[] = ["patient", "nurse", "doctor", "interpreter", "system", "demo"];

describe("legal transitions (SPEC section 5)", () => {
  it.each(names)("%s passes with all guards met and lands in the right column", (name) => {
    expect(check(name, happy[name])).toEqual({ ok: true, to: expectedTo[name] });
  });
});

describe("illegal transitions are rejected with a clear error (C13)", () => {
  it.each(names)("%s is rejected from every other status", (name) => {
    for (const status of VISIT_STATUSES) {
      if (RULES[name].from.includes(status)) continue;
      const r = check(name, { ...happy[name], status });
      expect(r).toMatchObject({ ok: false, code: "wrong_status" });
      if (!r.ok) expect(r.message).toContain(status);
    }
  });

  it.each(names)("%s is rejected for every role that may not do it", (name) => {
    for (const role of allRoles) {
      if (RULES[name].roles.includes(role)) continue;
      const r = check(name, { ...happy[name], actor: actor(role) });
      expect(r).toMatchObject({ ok: false, code: "forbidden_role" });
    }
  });

  const guardCases: Array<[TransitionName, Partial<GuardFacts>, string]> = [
    ["call_triage", { triageClaimedBy: "N-02" }, "Already being triaged"],
    ["complete_triage", { priority: null }, "priority is required"],
    ["complete_triage", { priority: 9 }, "between 1 and 5"],
    ["complete_triage", { triageClaimedBy: "N-02" }, "Being triaged by N-02"],
    ["consult_now", { activeSession: { doctorId: "D-01", state: "waiting" } }, "already claimed by D-01"],
    ["escort_confirm", { activeSession: null }, "no active escort"],
    ["escort_confirm", { activeSession: { doctorId: "D-05", state: "ready" } }, "no active escort"],
    ["escort_not_found", { activeSession: null }, "no active escort"],
    ["return_to_queue", { activeSession: { doctorId: "D-01", state: "waiting" } }, "belongs to D-01"],
    ["start_session", { activeSession: { doctorId: "D-05", state: "waiting" } }, "has not confirmed"],
    ["start_session", { transcriptionConsent: false }, "agree to transcription"],
    ["start_session", { activeSession: { doctorId: "D-01", state: "ready" } }, "belongs to D-01"],
    ["complete_to_tests", { noteSigned: false }, "must be signed"],
    ["complete_to_tests", { testsToOrder: 0 }, "at least one test"],
    ["complete_to_tests", { activeSession: { doctorId: "D-05", state: "ready" } }, "has not started"],
    ["complete_to_decision", { noteSigned: false }, "must be signed"],
    ["move_to_decision", { tests: ["results_back", "in_progress"] }, "Not all results"],
    ["move_to_decision", { tests: [] }, "Not all results"],
    ["record_decision", { decision: null }, "decision"],
    ["verify_pack", { packStatus: "verified" }, "no draft pack"],
    ["verify_pack", { actor: doctor, packLanguage: "ar" }, "interpreter must verify"],
    ["release_pack", { packStatus: "draft" }, "verified first"],
    ["release_pack", { packStatus: null }, "verified first"],
    ["order_more_tests", { testsToOrder: 0 }, "at least one test"],
    ["second_look", { activeSession: { doctorId: "D-01", state: "waiting" } }, "already claimed"],
  ];

  it.each(guardCases)("%s fails its guard when %o", (name, change, message) => {
    const r = check(name, { ...happy[name], ...change });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("guard_failed");
      expect(r.message.toLowerCase()).toContain(message.toLowerCase());
    }
  });
});

describe("specific rules", () => {
  it("only a doctor can record a decision, and Done needs a decision (C10)", () => {
    for (const role of allRoles.filter((r) => r !== "doctor")) {
      expect(check("record_decision", { ...happy.record_decision, actor: actor(role) }).ok).toBe(false);
    }
    expect(check("record_decision", { ...happy.record_decision, decision: undefined }).ok).toBe(false);
  });

  it("a second doctor cannot claim a patient another doctor called (C5)", () => {
    const claimed = { ...happy.consult_now, activeSession: { doctorId: "D-01", state: "waiting" as const } };
    expect(check("consult_now", claimed)).toMatchObject({ ok: false, code: "guard_failed" });
  });

  it("cards can move backward: Awaiting Decision to Diagnostics, and a second session (C11)", () => {
    expect(check("order_more_tests", happy.order_more_tests)).toEqual({ ok: true, to: "diagnostics" });
    expect(check("second_look", happy.second_look).ok).toBe(true);
    expect(
      check("escort_confirm", { ...happy.escort_confirm, status: "awaiting_decision" }),
    ).toEqual({ ok: true, to: "consultation" });
  });

  it("an English pack may be verified by the doctor because nothing was translated", () => {
    expect(check("verify_pack", { ...happy.verify_pack, actor: doctor, packLanguage: "en" }).ok).toBe(true);
  });

  it("check-in needs consent to contact and the AI notice (T1, B5)", () => {
    expect(checkCheckin({ consentContact: true, aiNoticeAccepted: true })).toEqual({ ok: true, to: "arrival" });
    expect(checkCheckin({ consentContact: false, aiNoticeAccepted: true })).toMatchObject({
      ok: false,
      message: "Consent to contact is required",
    });
    expect(checkCheckin({ consentContact: true, aiNoticeAccepted: false }).ok).toBe(false);
  });
});
