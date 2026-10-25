import { describe, expect, it } from "vitest";
import type { VisitCard } from "@/lib/contracts";
import { cardChips, escortRequests, inboxItems, statusText } from "@/components/nurse/boardLogic";
import { checkin, createEnquiry } from "@/lib/state/service";
import { staffState } from "@/lib/state/views";
import { checkinInput, testCtx } from "./helpers";

const NOW = "2026-10-24T10:00:00.000Z";

function card(over: Partial<VisitCard> = {}): VisitCard {
  return {
    id: "v1",
    displayId: "A-101",
    initials: "T.P.",
    name: null,
    language: "en",
    status: "triaged",
    priority: 3,
    stageChangedAt: "2026-10-24T09:50:00.000Z",
    createdAt: "2026-10-24T09:00:00.000Z",
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
    ...over,
  };
}

const session = (state: "waiting" | "ready" | "in_session") => ({
  id: "s1",
  visitId: "v1",
  doctorId: "D-05",
  doctorName: "Dr Okafor",
  cubicle: "Cubicle 4",
  number: 1,
  state,
  endReason: null,
  createdAt: "2026-10-24T09:58:00.000Z",
  startedAt: null,
  endedAt: null,
});

const labels = (c: VisitCard, longWait = 60) => cardChips(c, NOW, longWait).map((x) => x.label);

describe("status chip logic", () => {
  it("no chips for a plain card", () => {
    expect(labels(card())).toEqual([]);
  });
  it("Long wait after the threshold in a waiting stage, not in Done", () => {
    expect(labels(card(), 10)).toContain("Long wait");
    expect(labels(card(), 11)).not.toContain("Long wait");
    expect(labels(card({ status: "done" }), 1)).not.toContain("Long wait");
  });
  it("Escort requested while the session waits", () => {
    expect(labels(card({ activeSession: session("waiting") }))).toContain("Escort requested");
  });
  it("Notes capturing while in session", () => {
    expect(labels(card({ status: "consultation", activeSession: session("in_session") }))).toContain("Notes capturing");
  });
  it("Urgent enquiry beats Enquiry; Enquiry otherwise", () => {
    expect(labels(card({ openEnquiries: 1, urgentEnquiry: true }))).toEqual(["Urgent enquiry"]);
    expect(labels(card({ openEnquiries: 2 }))).toEqual(["Enquiry"]);
  });
  it("Interpreter needed from VisitCard.interpreterNeeded", () => {
    expect(labels(card({ interpreterNeeded: true }))).toContain("Interpreter needed");
  });
  it("every chip has a variant (text plus icon)", () => {
    const all = cardChips(
      card({ interpreterNeeded: true, urgentEnquiry: true, openEnquiries: 1, activeSession: session("waiting") }),
      NOW,
      1,
    );
    for (const c of all) expect(c.variant).toBeTruthy();
  });
  it("status text follows the stage", () => {
    expect(statusText(card({ status: "arrival" }))).toBe("Checking in");
    expect(statusText(card({ status: "triage_waiting" }))).toBe("Waiting for the triage nurse");
    expect(statusText(card({ status: "triage_waiting", beingTriagedBy: "N-01" }))).toBe("Called for triage by N-01");
    expect(statusText(card({ status: "consultation", activeSession: session("ready") }))).toBe(
      "Escorted · session not started",
    );
    expect(statusText(card({ status: "done", decision: "admit" }))).toBe("Admitted to ward");
  });
  it("escort requests list only waiting sessions", () => {
    const list = escortRequests([card({ activeSession: session("waiting") }), card({ id: "v2" })]);
    expect(list.map((c) => c.id)).toEqual(["v1"]);
  });
});

describe('"I feel worse" card flag', () => {
  it("raises the Urgent enquiry chip and puts the item at the top of the inbox", async () => {
    const ctx = testCtx();
    const a = await checkin(ctx, checkinInput("Test Person One"));
    const b = await checkin(ctx, checkinInput("Test Person Two"));
    await createEnquiry(ctx, {
      actor: { role: "patient", id: a.token },
      visitId: a.visitId,
      kind: "message",
      text: "Could I have some water?",
    });
    ctx.advance(1);
    await createEnquiry(ctx, { actor: { role: "patient", id: b.token }, visitId: b.visitId, kind: "feel_worse", text: "" });

    const state = staffState(ctx, "nurse", false);
    const worse = state.visits.find((v) => v.id === b.visitId)!;
    expect(worse.urgentEnquiry).toBe(true);
    expect(cardChips(worse, state.now, 999).map((c) => c.label)).toContain("Urgent enquiry");

    const inbox = inboxItems(state.enquiries);
    expect(inbox[0].enquiry.visitId).toBe(b.visitId);
    expect(inbox[0].tier).toBe("urgent");
  });
});
