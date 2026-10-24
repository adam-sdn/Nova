// The seven-column status machine (SPEC section 5) as pure guard functions.
// service.ts loads the facts, calls check(), and only writes when it returns ok.
import type { Actor, PackStatus, Role, SessionState, TestState, VisitStatus } from "@/lib/contracts";

export type TransitionName =
  | "register" //               T2  arrival -> triage_waiting
  | "call_triage" //            T3  stays in triage_waiting
  | "complete_triage" //        T4  triage_waiting -> triaged
  | "consult_now" //            T5  stays in triaged, creates a session
  | "escort_confirm" //         T6  triaged | awaiting_decision -> consultation
  | "escort_not_found" //       T6  back to the queue, flagged
  | "return_to_queue" //        doctor cancels a waiting session
  | "start_session" //          T7  stays in consultation
  | "complete_to_tests" //      T8  consultation -> diagnostics
  | "complete_to_decision" //   T9  consultation -> awaiting_decision
  | "update_test" //            T10 stays in diagnostics
  | "move_to_decision" //       T10 diagnostics -> awaiting_decision
  | "record_decision" //        T11 awaiting_decision -> done
  | "verify_pack" //            pack translation verified (needed by T12)
  | "release_pack" //           T12 stays in done
  | "order_more_tests" //       T13 awaiting_decision -> diagnostics
  | "second_look"; //           T13 stays in awaiting_decision, creates a new session

/** Facts a guard may look at. service.ts fills in what it knows; missing facts count as absent. */
export interface GuardFacts {
  status: VisitStatus;
  actor: Actor;
  triageClaimedBy?: string | null;
  /** The visit's session that is not ended, if any. */
  activeSession?: { doctorId: string; state: SessionState } | null;
  tests?: TestState[];
  packStatus?: PackStatus | null;
  packLanguage?: string | null;
  priority?: number | null;
  priorityScale?: { min: number; max: number };
  noteSigned?: boolean;
  testsToOrder?: number;
  transcriptionConsent?: boolean;
  decision?: string | null;
}

export type GuardResult =
  | { ok: true; to: VisitStatus }
  | { ok: false; code: "forbidden_role" | "wrong_status" | "guard_failed"; message: string };

interface Rule {
  roles: Role[];
  from: VisitStatus[];
  /** Target status. Omitted means the card stays where it is. */
  to?: VisitStatus;
  /** Extra guard. Returns an error message, or null when it passes. */
  guard?: (f: GuardFacts) => string | null;
}

const sameDoctor = (f: GuardFacts) =>
  f.activeSession && f.activeSession.doctorId !== f.actor.id
    ? `This session belongs to ${f.activeSession.doctorId}`
    : null;

export const RULES: Record<TransitionName, Rule> = {
  register: { roles: ["system", "nurse"], from: ["arrival"], to: "triage_waiting" },

  call_triage: {
    roles: ["nurse"],
    from: ["triage_waiting"],
    guard: (f) =>
      f.triageClaimedBy && f.triageClaimedBy !== f.actor.id
        ? `Already being triaged by ${f.triageClaimedBy}`
        : null,
  },

  complete_triage: {
    roles: ["nurse"],
    from: ["triage_waiting"],
    to: "triaged",
    guard: (f) => {
      if (f.triageClaimedBy && f.triageClaimedBy !== f.actor.id) return `Being triaged by ${f.triageClaimedBy}`;
      if (f.priority == null) return "A priority is required to complete triage";
      const s = f.priorityScale;
      if (s && (f.priority < s.min || f.priority > s.max)) return `Priority must be between ${s.min} and ${s.max}`;
      return null;
    },
  },

  consult_now: {
    roles: ["doctor"],
    from: ["triaged"],
    guard: (f) => (f.activeSession ? `Patient already claimed by ${f.activeSession.doctorId}` : null),
  },

  escort_confirm: {
    roles: ["nurse"],
    from: ["triaged", "awaiting_decision"],
    to: "consultation",
    guard: (f) => (f.activeSession?.state === "waiting" ? null : "There is no active escort request"),
  },

  escort_not_found: {
    roles: ["nurse"],
    from: ["triaged", "awaiting_decision"],
    guard: (f) => (f.activeSession?.state === "waiting" ? null : "There is no active escort request"),
  },

  return_to_queue: {
    roles: ["doctor"],
    from: ["triaged", "awaiting_decision"],
    guard: (f) =>
      f.activeSession?.state !== "waiting" ? "There is no waiting session to cancel" : sameDoctor(f),
  },

  start_session: {
    roles: ["doctor"],
    from: ["consultation"],
    guard: (f) => {
      if (f.activeSession?.state !== "ready") return "The nurse has not confirmed the patient is with the doctor";
      if (!f.transcriptionConsent) return "The patient must be informed and agree to transcription";
      return sameDoctor(f);
    },
  },

  complete_to_tests: {
    roles: ["doctor"],
    from: ["consultation"],
    to: "diagnostics",
    guard: (f) => {
      if (f.activeSession?.state !== "in_session") return "The session has not started";
      if (!f.noteSigned) return "The note must be signed";
      if (!f.testsToOrder) return "Order at least one test";
      return sameDoctor(f);
    },
  },

  complete_to_decision: {
    roles: ["doctor"],
    from: ["consultation"],
    to: "awaiting_decision",
    guard: (f) => {
      if (f.activeSession?.state !== "in_session") return "The session has not started";
      if (!f.noteSigned) return "The note must be signed";
      return sameDoctor(f);
    },
  },

  update_test: { roles: ["nurse", "doctor", "system", "demo"], from: ["diagnostics"] },

  move_to_decision: {
    roles: ["nurse", "doctor"],
    from: ["diagnostics"],
    to: "awaiting_decision",
    guard: (f) => {
      const t = f.tests ?? [];
      return t.length && t.every((s) => s === "results_back") ? null : "Not all results are back";
    },
  },

  record_decision: {
    roles: ["doctor"],
    from: ["awaiting_decision"],
    to: "done",
    guard: (f) => (f.decision ? null : "A decision (Discharge or Admit) is required"),
  },

  verify_pack: {
    roles: ["interpreter", "doctor"],
    from: ["done"],
    guard: (f) => {
      if (f.packStatus !== "draft") return "There is no draft pack to verify";
      // Only an English pack needs no translation, so only then may the doctor verify it.
      if (f.actor.role === "doctor" && f.packLanguage !== "en") return "The interpreter must verify the translation";
      return null;
    },
  },

  release_pack: {
    roles: ["doctor"],
    from: ["done"],
    guard: (f) => (f.packStatus === "verified" ? null : "The pack translation must be verified first"),
  },

  order_more_tests: {
    roles: ["doctor"],
    from: ["awaiting_decision"],
    to: "diagnostics",
    guard: (f) => (f.testsToOrder ? null : "Order at least one test"),
  },

  second_look: {
    roles: ["doctor"],
    from: ["awaiting_decision"],
    guard: (f) => (f.activeSession ? `Patient already claimed by ${f.activeSession.doctorId}` : null),
  },
};

export function check(name: TransitionName, f: GuardFacts): GuardResult {
  const rule = RULES[name];
  if (!rule.roles.includes(f.actor.role)) {
    return { ok: false, code: "forbidden_role", message: `${name} is not allowed for role ${f.actor.role}` };
  }
  if (!rule.from.includes(f.status)) {
    return { ok: false, code: "wrong_status", message: `${name} is not allowed from ${f.status}` };
  }
  const err = rule.guard?.(f) ?? null;
  if (err) return { ok: false, code: "guard_failed", message: err };
  return { ok: true, to: rule.to ?? f.status };
}

/** T1 check-in guard (there is no visit yet). */
export function checkCheckin(input: { consentContact: boolean; aiNoticeAccepted: boolean }): GuardResult {
  if (!input.consentContact) return { ok: false, code: "guard_failed", message: "Consent to contact is required" };
  if (!input.aiNoticeAccepted) {
    return { ok: false, code: "guard_failed", message: "The automated-assistant notice must be accepted" };
  }
  return { ok: true, to: "arrival" };
}
