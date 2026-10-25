// Pure display logic for the nurse board. No React, so it is unit tested in tests/nurse-board.test.ts.
import type { ChipVariant } from "@/lib/ui";
import type { EnquiryTier, EnquiryView, TestState, VisitCard, VisitStatus } from "@/lib/contracts";
import { inboxTier, suggestEnquiryPriority, tierRank, type SuggestedTier } from "@/lib/rules/enquiry/priority";

export const COLUMN_HINTS: Record<VisitStatus, string> = {
  arrival: "At the front desk, checking in",
  triage_waiting: "Registered, queued for triage",
  triaged: "Priority set, waiting for a doctor",
  diagnostics: "Tests under way or waiting for results",
  consultation: "In a cubicle with the doctor",
  awaiting_decision: "Results back, team deciding next steps",
  done: "Leaves the board after [time]",
};

export const TEST_STATE_LABELS: Record<TestState, string> = {
  ordered: "ordered",
  in_progress: "in progress",
  done: "done",
  results_back: "results back",
};

const WAITING_STAGES: VisitStatus[] = ["triage_waiting", "triaged", "diagnostics", "awaiting_decision"];

const minutesSince = (from: string, now: string) => (Date.parse(now) - Date.parse(from)) / 60_000;

export interface CardChip {
  label: string;
  variant: ChipVariant;
}

export function cardChips(c: VisitCard, now: string, longWaitMinutes: number): CardChip[] {
  const chips: CardChip[] = [];
  if (c.activeSession?.state === "waiting") chips.push({ label: "Escort requested", variant: "escort" });
  if (c.escortFlag) chips.push({ label: "Not found · back in queue", variant: "high" });
  if (WAITING_STAGES.includes(c.status) && minutesSince(c.stageChangedAt, now) >= longWaitMinutes) {
    chips.push({ label: "Long wait", variant: "longWait" });
  }
  if (c.status === "consultation" && c.activeSession?.state === "in_session") {
    chips.push({ label: "Notes capturing", variant: "note" });
  }
  if (c.urgentEnquiry) chips.push({ label: "Urgent enquiry", variant: "urgent" });
  else if (c.openEnquiries > 0) chips.push({ label: "Enquiry", variant: "enquiry" });
  if (c.interpreterNeeded) chips.push({ label: "Interpreter needed", variant: "enquiry" });
  return chips;
}

export function statusText(c: VisitCard): string {
  const s = c.activeSession;
  switch (c.status) {
    case "arrival":
      return "Checking in";
    case "triage_waiting":
      return c.beingTriagedBy ? `Called for triage by ${c.beingTriagedBy}` : "Waiting for the triage nurse";
    case "triaged":
      return s?.state === "waiting" ? `Called by ${s.doctorName}` : "Waiting for a doctor";
    case "diagnostics":
      return c.tests.length > 0 && c.tests.every((t) => t.state === "results_back")
        ? "All results back"
        : "Tests under way";
    case "consultation":
      return s?.state === "in_session" ? "In the cubicle" : "Escorted · session not started";
    case "awaiting_decision":
      return s?.state === "waiting" ? `Called by ${s.doctorName}` : "Results back · review pending";
    case "done":
      return c.decision === "admit" ? "Admitted to ward" : "Discharged";
  }
}

/** Sorted by priority (lower number first, unset last), then longest time in stage. */
export function sortCards(cards: VisitCard[]): VisitCard[] {
  return [...cards].sort((a, b) => {
    const pa = a.priority ?? Number.POSITIVE_INFINITY;
    const pb = b.priority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return Date.parse(a.stageChangedAt) - Date.parse(b.stageChangedAt);
  });
}

export const escortRequests = (cards: VisitCard[]) => cards.filter((c) => c.activeSession?.state === "waiting");

export interface InboxItem {
  enquiry: EnquiryView;
  /** The tier the inbox files it under: never lower than the server's (rule 4). */
  tier: EnquiryTier;
  suggestion: SuggestedTier;
  reason: string;
}

/** Open enquiries, highest tier first; "I feel worse" first within a tier; then oldest first. */
export function inboxItems(enquiries: EnquiryView[]): InboxItem[] {
  return enquiries
    .filter((e) => e.status === "open")
    .map((e) => {
      const s = e.kind === "feel_worse" ? { tier: "urgent" as const, reason: "" } : suggestEnquiryPriority(e.text);
      return {
        enquiry: e,
        tier: inboxTier(e.tier, s.tier),
        suggestion: s.tier,
        reason: e.kind === "feel_worse" ? "Patient pressed I feel worse. Urgent." : (e.aiReason ?? s.reason),
      };
    })
    .sort((a, b) => {
      const r = tierRank(b.tier) - tierRank(a.tier);
      if (r !== 0) return r;
      const k = Number(b.enquiry.kind === "feel_worse") - Number(a.enquiry.kind === "feel_worse");
      if (k !== 0) return k;
      return Date.parse(a.enquiry.createdAt) - Date.parse(b.enquiry.createdAt);
    });
}

export type InboxFilter = "all" | "urgent" | "high" | "routine";

export function matchesFilter(item: InboxItem, f: InboxFilter): boolean {
  return f === "all" || item.tier === f;
}
