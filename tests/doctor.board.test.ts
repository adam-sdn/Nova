import { describe, expect, it } from "vitest";
import type { MessageStatus, SessionView, VisitCard } from "@/lib/contracts";
import {
  canComplete,
  canSend,
  canStartSession,
  hardcodedSummary,
  messageChip,
  readyQueue,
  sessionSteps,
  PENDING_BACK_TRANSLATION,
} from "@/lib/agents/doctor/board";

const card = (p: Partial<VisitCard>): VisitCard => ({
  id: "v",
  displayId: "A-100",
  initials: "T.P.",
  name: null,
  language: "en",
  status: "triaged",
  priority: 3,
  stageChangedAt: "2026-10-24T09:00:00.000Z",
  createdAt: "2026-10-24T08:00:00.000Z",
  beingTriagedBy: null,
  escortFlag: false,
  decision: null,
  tests: [],
  activeSession: null,
  sessionCount: 0,
  openEnquiries: 0,
  urgentEnquiry: false,
  interpreterNeeded: false,
  summary: null,
  ...p,
});

const session = (state: SessionView["state"]): SessionView => ({
  id: "s",
  visitId: "v",
  doctorId: "D-05",
  doctorName: "Dr Okafor",
  cubicle: "Cubicle 4",
  number: 1,
  state,
  endReason: null,
  createdAt: "",
  startedAt: null,
  endedAt: null,
});

describe("readyQueue (C3)", () => {
  it("keeps only unclaimed triaged patients, sorted by priority then longest wait", () => {
    const q = readyQueue([
      card({ id: "a", priority: 3, stageChangedAt: "2026-10-24T09:00:00.000Z" }),
      card({ id: "b", priority: 2, stageChangedAt: "2026-10-24T09:30:00.000Z" }),
      card({ id: "c", priority: 3, stageChangedAt: "2026-10-24T08:00:00.000Z" }),
      card({ id: "d", priority: 2, stageChangedAt: "2026-10-24T09:10:00.000Z" }),
      card({ id: "e", status: "triage_waiting" }),
      card({ id: "f", activeSession: session("waiting") }),
    ]);
    expect(q.map((v) => v.id)).toEqual(["d", "b", "c", "a"]);
  });
});

describe("message chips", () => {
  const cases: Array<[MessageStatus, string]> = [
    ["drafted", "Checking"],
    ["checked", "Checking"],
    ["ready_for_doctor", "Ready to send"],
    ["flagged", "Held"],
    ["held", "Held"],
    ["escalated", "Held"],
    ["delivered", "Delivered"],
    ["ai_checked", "AI-checked"],
    ["needs_checking", "Needs checking"],
  ];
  it.each(cases)("%s -> %s", (s, label) => expect(messageChip(s).label).toBe(label));
  it("Send is enabled only for ready_for_doctor", () => {
    for (const [s] of cases) expect(canSend(s)).toBe(s === "ready_for_doctor");
  });
  it("back-translation placeholder", () => expect(PENDING_BACK_TRANSLATION).toBe("[Translation pending AI integration]"));
});

describe("session frame", () => {
  it("Start session is disabled until the nurse confirms (E3)", () => {
    expect(canStartSession(session("waiting"), true)).toBe(false);
    expect(canStartSession(session("ready"), false)).toBe(false);
    expect(canStartSession(session("ready"), true)).toBe(true);
    expect(canStartSession(session("in_session"), true)).toBe(false);
  });
  it("stepper", () => {
    expect(sessionSteps(session("waiting")).map((s) => s.done)).toEqual([true, true, false, false]);
    expect(sessionSteps(session("ready")).map((s) => s.done)).toEqual([true, true, true, false]);
    expect(sessionSteps(session("in_session")).map((s) => s.done)).toEqual([true, true, true, true]);
  });
  it("Complete requires a signed note, and tests for send-for-tests (C8, E7)", () => {
    expect(canComplete("decision", false, 0).ok).toBe(false);
    expect(canComplete("decision", true, 0).ok).toBe(true);
    expect(canComplete("tests", true, 0).ok).toBe(false);
    expect(canComplete("tests", true, 2).ok).toBe(true);
    expect(canComplete("tests", false, 2).ok).toBe(false);
  });
  it("hardcoded summary", () => expect(hardcodedSummary("chest hurts")).toBe("Patient reported chest hurts"));
});
