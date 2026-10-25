import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAi, providerAdapter, transcribe, DEFAULT_GEMINI_MODEL, type RunCli } from "@/lib/ai";
import { registerTranslationAgent } from "@/lib/agents/translation";
import { verifyAudit } from "@/lib/state/audit";
import * as svc from "@/lib/state/service";
import { encodeWav } from "@/lib/voice/wav";
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

const gemini = (json: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] });

describe("real AI provider (Gemini for agent tasks)", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("sends pseudonymised text to Gemini with the key in a header, and restores identifiers in the answer", async () => {
    const { f, calls } = fakeFetch(gemini({ summary: "[[NAME_1]] reports chest pain.", keyPoints: ["Chest pain"] }));
    const ai = createAi({ mock: false, adapter: providerAdapter(f) });
    const out = await ai.summarisePatient({ reason: "Grace Obi has chest pain", triageNote: "", enquiries: [] }, { name: "Grace Obi" });

    expect(out.summary).toBe("Grace Obi reports chest pain.");
    expect(calls).toHaveLength(1);
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
    await createAi({ mock: false, adapter: providerAdapter(f) }).classifyEnquiry("My arm hurts");
    expect(calls[0].url).toContain("/models/gemini-test-model:generateContent");
  });

  it("fails clearly without a key instead of calling out", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { f, calls } = fakeFetch({});
    await expect(createAi({ mock: false, adapter: providerAdapter(f) }).classifyEnquiry("hi")).rejects.toThrow(/GEMINI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("keeps demo translation models on the labelled mock, with no network call", async () => {
    const { f, calls } = fakeFetch({});
    const t = await createAi({ mock: false, adapter: providerAdapter(f) }).translateMessage("Take 5 mg", "en", "es", {}, { model: "TranslateGemma" });
    expect(t).toBe("[mock es] Take 5 mg");
    expect(calls).toHaveLength(0);
  });

  it("routes ollama: and gemini: translation models to those providers", async () => {
    const ollama = fakeFetch({ message: { content: JSON.stringify({ text: "Tome 5 mg" }) } });
    await createAi({ mock: false, adapter: providerAdapter(ollama.f) }).translateMessage("Take 5 mg", "en", "es", {}, { model: "ollama:qwen3.5:9b" });
    expect(ollama.calls[0].url).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(String(ollama.calls[0].init.body)).model).toBe("qwen3.5:9b");

    const g = fakeFetch(gemini({ text: "Tome 5 mg" }));
    await createAi({ mock: false, adapter: providerAdapter(g.f) }).backTranslate("Tome 5 mg", "es", "en", {}, { model: "gemini:gemini-x" });
    expect(g.calls[0].url).toContain("/models/gemini-x:generateContent");
  });
});

describe("speech-to-text (OpenWhispr, local only)", () => {
  it("forces the local backend, passes the speaker's language and returns the text", async () => {
    let seen: string[] = [];
    const run: RunCli = async (_cmd, args) => {
      seen = args;
      return JSON.stringify({ text: "  I am not allergic to penicillin. ", provider: "whisper", model: "base" });
    };
    const text = await transcribe("C:/tmp/turn.wav", "ar", run);
    expect(text).toBe("I am not allergic to penicillin.");
    expect(seen.indexOf("--local")).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf("--local")).toBeLessThan(seen.indexOf("transcribe"));
    expect(seen).not.toContain("--remote");
    expect(seen.slice(seen.indexOf("--language"), seen.indexOf("--language") + 2)).toEqual(["--language", "ar"]);
  });

  it("encodes 16 kHz mono 16-bit WAV with a correct header", () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16_000));
    const ascii = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(o + i)));
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(16_000);
    expect(wav.getUint32(40, true)).toBe(8);
    expect([wav.getInt16(46, true), wav.getInt16(48, true), wav.getInt16(50, true)]).toEqual([32767, -32768, 32767]);
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

describe("patient speech captured in the room", () => {
  it("the session's doctor can record a patient line; the audit names the doctor", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    expect(() => svc.requireCaptureAllowed(ctx, c.sessionId, doctor)).not.toThrow();
    const { message } = await svc.createMessage(ctx, c.sessionId, { actor: doctor, direction: "patient_to_doctor", text: "Me duele el pecho" });
    expect(message.direction).toBe("patient_to_doctor");
    const row = ctx.db.prepare("SELECT actor FROM audit WHERE action = 'message.drafted' ORDER BY seq DESC LIMIT 1").get() as { actor: string };
    expect(row.actor).toContain(doctor.id);
    expect(verifyAudit(ctx.db).ok).toBe(true);
  });

  it("another doctor, or a closed session, cannot record", async () => {
    const ctx = testCtx();
    const c = await inSession(ctx);
    expect(() => svc.requireCaptureAllowed(ctx, c.sessionId, doctor2)).toThrow(/Only this session's doctor/);
    await expect(svc.createMessage(ctx, c.sessionId, { actor: doctor2, direction: "patient_to_doctor", text: "Hola" })).rejects.toMatchObject({
      code: "forbidden_role",
    });
    expect(() => svc.requireCaptureAllowed(ctx, c.sessionId, nurse)).toThrow();
  });
});
