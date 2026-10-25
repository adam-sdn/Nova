// Pure helpers for the doctor screen: queue order, message chips, session frame guards.
// Client-safe: no server imports.
import type { MessageStatus, SessionView, VisitCard } from "@/lib/contracts";

/** Triaged patients not claimed by any doctor, sorted by nurse priority (lower first), then longest wait. */
export function readyQueue(visits: VisitCard[]): VisitCard[] {
  return visits
    .filter((v) => v.status === "triaged" && !v.activeSession)
    .sort(
      (a, b) =>
        (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) ||
        Date.parse(a.stageChangedAt) - Date.parse(b.stageChangedAt),
    );
}

export type MessageChipKind = "checking" | "ready" | "held" | "delivered" | "aiChecked" | "needsChecking";

export function messageChip(s: MessageStatus): { kind: MessageChipKind; label: string } {
  switch (s) {
    case "drafted":
    case "checked":
      return { kind: "checking", label: "Checking" };
    case "ready_for_doctor":
      return { kind: "ready", label: "Ready to send" };
    case "flagged":
    case "held":
    case "escalated":
      return { kind: "held", label: "Held" };
    case "delivered":
      return { kind: "delivered", label: "Delivered" };
    case "ai_checked":
      return { kind: "aiChecked", label: "AI-checked" };
    case "needs_checking":
      return { kind: "needsChecking", label: "Needs checking" };
  }
}

/** The doctor's Send is enabled only when every check passed. */
export const canSend = (s: MessageStatus) => s === "ready_for_doctor";

// TODO(ai): shown until the translation agent fills backTranslation.
export const PENDING_BACK_TRANSLATION = "[Translation pending AI integration]";

export const canStartSession = (s: SessionView | null, transcriptionConsent: boolean) =>
  s?.state === "ready" && transcriptionConsent;

export function sessionSteps(s: SessionView) {
  const escorted = s.state === "ready" || s.state === "in_session";
  return [
    { label: "Called", done: true },
    { label: "Nurse notified", done: true },
    { label: "Patient escorted", done: escorted },
    { label: "In session", done: s.state === "in_session" },
  ];
}

export function canComplete(next: "tests" | "decision", signed: boolean, testCount: number): { ok: boolean; reason?: string } {
  if (!signed) return { ok: false, reason: "Sign the note first" };
  if (next === "tests" && testCount === 0) return { ok: false, reason: "Add at least one test" };
  return { ok: true };
}

// TODO(ai): replace with the AI summary from triage once it is wired for every row.
export const hardcodedSummary = (reason: string) => `Patient reported ${reason}`;

export const COMPLETE_TARGET = { tests: "Diagnostics In Progress", decision: "Awaiting Decision" } as const;
