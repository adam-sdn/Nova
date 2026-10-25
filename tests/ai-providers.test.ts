import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAi, providerAdapter, DEFAULT_GEMINI_MODEL, type AiAdapter } from "@/lib/ai";
import { mockAdapter } from "@/lib/ai.fixtures";
import { registerTranslationAgent } from "@/lib/agents/translation";
import { appConfig, assertDistinctFamilies } from "@/lib/config";
import { verifyAudit } from "@/lib/state/audit";
import * as svc from "@/lib/state/service";
import { checkinInput, doctor, doctor2, nurse, testCtx, type TestCtx } from "@/tests/helpers";

registerTranslationAgent();

function fakeFetch(reply: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const gemini = (json: unknown) => ({ candidates: [{ content: { parts: [{ text: typeof json === "string" ? json : JSON.stringify(json) }] } }] });
const myMemory = (text: string, extra: Record<string, unknown> = {}) => ({ responseStatus: 200, responseData: { translatedText: text }, ...extra });
const real = (f: typeof fetch) => createAi({ mock: false, adapter: providerAdapter(f) });

describe("Gemini for the agent tasks", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("sends pseudonymised text with the key in a header, and restores identifiers in the answer", async () => {
    const { f, calls } = fakeFetch(gemini({ summary: "[[NAME_1]] reports chest pain.", keyPoints: ["Chest pain"] }));
    const out = await real(f).summarisePatient({ reason: "Grace Obi has chest pain", triageNote: "", enquiries: [] }, { name: "Grace Obi" });

    expect(out.summary).toBe("Grace Obi reports chest pain.");
    expect(calls[0].url).toContain(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(calls[0].url).not.toContain("test-key");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = String(calls[0].init.body);
    expect(body).not.toContain("Grace Obi");
    expect(body).toContain("[[NAME_1]]");
  });

  it("uses GEMINI_MODEL when set", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-test-model");
    const { f, calls } = fakeFetch(gemini({ category: "pain", confidence: 0.8, reason: "Mentions pain" }));
    await real(f).classifyEnquiry("My arm hurts");
    expect(calls[0].url).toContain("/models/gemini-test-model:generateContent");
  });

  it("fails clearly without a key instead of calling out", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { f, calls } = fakeFetch({});
    await expect(real(f).classifyEnquiry("hi")).rejects.toThrow(/GEMINI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("retries a failing model, then falls back to a sibling of the same family; a bad request is not retried", async () => {
    const urls: string[] = [];
    let n = 0;
    const flaky = (async (url: string) => {
      urls.push(String(url));
      return ++n <= 2
        ? new Response(JSON.stringify({ error: { message: "Internal error encountered." } }), { status: 500 })
        : new Response(JSON.stringify(gemini({ text: "Not allergic" })), { status: 200 });
    }) as unknown as typeof fetch;
    const t = await real(flaky).backTranslate("x", "ar", "en", {}, { model: "gemini:gemini-3.5-flash-lite" });
    expect(t).toBe("Not allergic");
    expect(urls.map((u) => u.match(/models\/([^:]+)/)![1])).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);

    let calls = 0;
    const bad = (async () => (calls++, new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }))) as unknown as typeof fetch;
    await expect(real(bad).classifyEnquiry("hi")).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  it("accepts follow-ups as a bare list or under another key, and drops malformed items", async () => {
    const asList = fakeFetch(gemini([{ text: "Review result: Bloods", fromSection: "Tests ordered" }, { nope: 1 }]));
    expect(await real(asList.f).draftFollowUps({ sections: {}, tests: ["Bloods"] })).toEqual([{ text: "Review result: Bloods", fromSection: "Tests ordered" }]);
    const otherKey = fakeFetch(gemini({ followUps: [{ text: "Recheck pain in 2 hours" }] }));
    expect(await real(otherKey.f).draftFollowUps({ sections: {}, tests: [] })).toEqual([{ text: "Recheck pain in 2 hours", fromSection: "Note" }]);
  });

  it("calls Gemma without a system instruction or JSON mode, and reads JSON out of a fenced reply", async () => {
    const { f, calls } = fakeFetch(gemini('Here you go:\n```json\n{"passed": true, "errors": []}\n```'));
    const v = await real(f).verifyTranslation({ source: "a", translation: "b", backTranslation: "a", ruleErrors: [] }, {}, { model: "gemini:gemma-3-27b-it" });
    expect(v).toEqual({ passed: true, errors: [] });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toContain("/models/gemma-3-27b-it:generateContent");
    expect(body.systemInstruction).toBeUndefined();
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain("Task:");
  });
});

describe("MyMemory as the translator", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("posts the text in the body (never the URL) and returns the translation", async () => {
    const { f, calls } = fakeFetch(myMemory("No es alérgico a la penicilina. Tome 5 mg."));
    const t = await real(f).translateMessage("You are not allergic to penicillin. Take 5 mg.", "en", "es", {}, { model: "mymemory" });
    expect(t).toBe("No es alérgico a la penicilina. Tome 5 mg.");
    expect(calls[0].url).toBe("https://api.mymemory.translated.net/get");
    expect(calls[0].init.method).toBe("POST");
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("q")).toContain("penicillin");
    expect(form.get("langpair")).toBe("en|es");
  });

  it("maps zh to zh-CN, decodes HTML entities, and adds MYMEMORY_EMAIL when set", async () => {
    vi.stubEnv("MYMEMORY_EMAIL", "demo@example.com");
    const { f, calls } = fakeFetch(myMemory("Don&#39;t drive &amp; rest"));
    expect(await real(f).translateMessage("x", "en", "zh", {}, { model: "mymemory" })).toBe("Don't drive & rest");
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("langpair")).toBe("en|zh-CN");
    expect(form.get("de")).toBe("demo@example.com");
  });

  it("treats the daily limit and failed lookups as errors, not as translations", async () => {
    await expect(real(fakeFetch(myMemory("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS")).f).translateMessage("x", "en", "ar", {}, { model: "mymemory" })).rejects.toThrow(/limit/);
    await expect(real(fakeFetch({ responseStatus: 403, responseData: { translatedText: "INVALID LANGUAGE PAIR" } }).f).translateMessage("x", "en", "xx", {}, { model: "mymemory" })).rejects.toThrow(/could not translate/);
  });

  it("is only a translator", async () => {
    const { f } = fakeFetch({});
    await expect(real(f).verifyTranslation({ source: "a", translation: "b", backTranslation: "a", ruleErrors: [] }, {}, { model: "mymemory" })).rejects.toThrow(/cannot/);
  });

  it("the configured translator, back-translator and verifier are three different families (rule 11)", () => {
    const t = appConfig.translation;
    expect(() => assertDistinctFamilies(t)).not.toThrow();
    expect([t.translator.model, t.backTranslator.model, t.aiVerifier.model]).toEqual(["mymemory", "gemini:gemini-3.5-flash-lite", "demo-verifier"]);
  });
});

async function inSession(ctx: TestCtx, language = "es") {
  const c = await svc.checkin(ctx, checkinInput("Test Person One", language));
  await svc.completeTriage(ctx, c.visitId, { actor: nurse, priority: 3, note: "Synthetic" });
  const { session } = await svc.consultNow(ctx, c.visitId, doctor);
  await svc.escorted(ctx, session.id, { actor: nurse, outcome: "with_doctor" });
  await svc.startSession(ctx, session.id, { actor: doctor, transcriptionConsent: true });
  return { ...c, sessionId: session.id };
}

describe("when a translation service fails", () => {
  const failing: AiAdapter = {
    async complete(task, input, model) {
      if (task === "translate_message") throw new Error("MyMemory daily limit reached");
      return mockAdapter.complete(task, input, model);
    },
  };

  it("a doctor line is held with the reason and cannot be sent; a patient line needs checking", async () => {
    const ctx = testCtx({ adapter: failing });
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "doctor_to_patient", text: "Take 5 mg." });
    expect(message.status).toBe("held");
    expect(message.safety).toMatchObject({ passed: false, errors: [{ kind: "translation_unavailable", detail: "MyMemory daily limit reached" }] });
    await expect(svc.sendMessage(ctx, c.sessionId, message.id, doctor)).rejects.toMatchObject({ code: "wrong_status" });

    const patientLine = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "patient_to_doctor", text: "Me duele" });
    expect(patientLine.message.status).toBe("needs_checking");
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });
});

describe("a patient line typed on the doctor's device", () => {
  it("is accepted from the session's doctor; the audit names the doctor", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "patient_to_doctor", text: "Me duele el pecho" });
    expect(message.direction).toBe("patient_to_doctor");
    const row = ctx.db.prepare("SELECT actor FROM audit WHERE action = 'message.drafted' ORDER BY seq DESC LIMIT 1").get() as { actor: string };
    expect(row.actor).toContain(doctor.id);
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });

  it("is refused from another doctor", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    await expect(svc.createMessage(ctx, c.sessionId, { actor: doctor2, direction: "patient_to_doctor", text: "Hola" })).rejects.toMatchObject({
      code: "forbidden_role",
    });
  });
});
