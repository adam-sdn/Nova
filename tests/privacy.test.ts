import { describe, expect, it } from "vitest";
import * as svc from "@/lib/state/service";
import { createAi, type AiAdapter, type AiTask } from "@/lib/ai";
import { mockAdapter } from "@/lib/ai.fixtures";
import { patientState } from "@/lib/state/views";
import { checkinInput, doctor, interpreter, nurse, testCtx } from "./helpers";

const NAME = "Zephyrine Quillfeather";

/** Records everything the adapter is given, then answers like the mock. */
function spyAdapter() {
  const seen: Array<{ task: AiTask; input: string }> = [];
  const adapter: AiAdapter = {
    async complete(task, input) {
      seen.push({ task, input });
      return mockAdapter.complete(task, input);
    },
  };
  return { adapter, seen };
}

describe("pseudonymisation before AI calls (H2)", () => {
  it("the adapter never sees the patient's name, phone or email, and output is restored", async () => {
    const { adapter, seen } = spyAdapter();
    const ai = createAi({ mock: true, adapter });
    const text = `I am ${NAME}, call 07123 456 789 or zq@example.com. My chest hurts.`;
    const r = await ai.summarisePatient({ reason: text, triageNote: "", enquiries: [] }, { name: NAME });
    expect(seen).toHaveLength(1);
    for (const leak of ["Zephyrine", "Quillfeather", "07123", "example.com"]) expect(seen[0].input).not.toContain(leak);
    expect(r.summary).toContain(NAME); // restored afterwards, on our server
  });

  it("no service call ever sends the name to the adapter across a whole visit", async () => {
    const { adapter, seen } = spyAdapter();
    const ctx = testCtx({ adapter });
    const c = await svc.checkin(ctx, { ...checkinInput(NAME), reason: `${NAME} has a headache` });
    const patient = { role: "patient" as const, id: c.token };
    await svc.createEnquiry(ctx, { actor: patient, visitId: c.visitId, kind: "message", text: `It is ${NAME}, still waiting?` });
    await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 2, note: `${NAME} alert` });
    const { session } = await svc.consultNow(ctx, c.visitId, doctor);
    await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
    await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
    await svc.createMessage(ctx, session.id, { actor: doctor, direction: "doctor_to_patient", text: `Hello ${NAME}` });
    await svc.completeSession(ctx, session.id, {
      actor: doctor,
      next: "decision",
      note: { sections: { Plan: "p" }, transcript: [], signed: true },
      tests: [],
    });
    await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: `${NAME} fine`, advice: "rest", medicines: [] });
    const tasks = new Set(seen.map((s) => s.task));
    expect(tasks).toEqual(
      new Set(["translate_intake", "classify_enquiry", "summarise_patient", "translate_message", "back_translate", "draft_pack"]),
    );
    for (const s of seen) {
      expect(s.input).not.toContain("Zephyrine");
      expect(s.input).not.toContain("Quillfeather");
    }
  });

  it("with MOCK_AI off and no provider, AI calls fail instead of reaching the network", async () => {
    const ai = createAi({ mock: false });
    await expect(ai.classifyEnquiry("hi")).rejects.toThrow(/not configured/);
  });
});

describe("encryption at rest (H1)", () => {
  it("names, reasons, triage notes, enquiries, messages, notes and packs are not stored in plaintext", async () => {
    const ctx = testCtx();
    const marks = {
      name: "Plaintextname Visible",
      reason: "REASON-MARKER",
      triage: "TRIAGE-MARKER",
      enquiry: "ENQUIRY-MARKER",
      message: "MESSAGE-MARKER",
      note: "NOTE-MARKER",
      transcript: "TRANSCRIPT-MARKER",
      pack: "PACK-MARKER",
    };
    const c = await svc.checkin(ctx, { ...checkinInput(marks.name), reason: marks.reason });
    await svc.createEnquiry(ctx, { actor: { role: "patient", id: c.token }, visitId: c.visitId, kind: "message", text: marks.enquiry });
    await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 2, note: marks.triage });
    const { session } = await svc.consultNow(ctx, c.visitId, doctor);
    await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
    await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
    const { message } = await svc.createMessage(ctx, session.id, { actor: doctor, direction: "doctor_to_patient", text: marks.message });
    await svc.verifyMessage(ctx, message.id, { actor: interpreter, action: "verify" });
    await svc.completeSession(ctx, session.id, {
      actor: doctor,
      next: "decision",
      note: { sections: { Plan: marks.note }, transcript: [marks.transcript], signed: true },
      tests: [],
    });
    await svc.recordDecision(ctx, c.visitId, { actor: doctor, outcome: "discharge", results: marks.pack, advice: "", medicines: [] });

    const tables = ["visits", "enquiries", "messages", "notes", "packs", "sessions", "tests", "audit"];
    const dump = JSON.stringify(tables.map((t) => ctx.db.prepare(`SELECT * FROM ${t}`).all()));
    for (const m of [...Object.values(marks), "Plaintextname"]) expect(dump).not.toContain(m);

    // The server can still decrypt for the right viewer.
    expect(patientState(ctx, c.token)?.messages[0]?.text).toContain(marks.message);
  });
});
