import { describe, expect, it, vi } from "vitest";
import { createAi, type AiAdapter } from "@/lib/ai";
import { mockAdapter } from "@/lib/ai.fixtures";
import { appConfig, assertDistinctFamilies } from "@/lib/config";
import { pseudonymise, restore, type Identifiers, type PseudoMap } from "@/lib/privacy/crypto";
import { runPipeline, runPatientPipeline } from "./pipeline";

const cfg = { ...appConfig.translation, weakLanguages: ["xx"], maxRetries: 2 };
const NAME = "Testa Personne";

function recordingAdapter(tamper?: (task: string, out: string) => string) {
  const calls: { task: string; input: string; model?: string }[] = [];
  const adapter: AiAdapter = {
    async complete(task, input, model) {
      calls.push({ task, input, model });
      const out = await mockAdapter.complete(task, input, model);
      return tamper ? tamper(task, out) : out;
    },
  };
  return { adapter, calls };
}

const base = { messageId: "m1", sourceLang: "en", targetLang: "fr", ids: { name: NAME }, now: () => new Date(0) };

describe("translation pipeline (MOCK_AI=1)", () => {
  it("clean message ends ready_for_doctor and records every step", async () => {
    const { adapter, calls } = recordingAdapter();
    const r = await runPipeline({ ai: createAi({ mock: true, adapter }), config: cfg }, { ...base, source: "Hello, how are you?" });
    expect(r.state).toBe("ready_for_doctor");
    expect(r.tier).toBe("routine");
    expect(r.trace.steps.map((s) => s.name)).toEqual(["translate", "backTranslate", "ruleCheck", "aiVerify", "decision"]);
    expect(r.trace.finalState).toBe("ready_for_doctor");
    expect(r.trace.attempt).toBe(1);
    expect(calls.map((c) => c.model)).toEqual([cfg.translator.model, cfg.backTranslator.model, cfg.aiVerifier.model]);
  });

  it("planted critical error retries maxRetries times with feedback, then held (F2)", async () => {
    const { adapter, calls } = recordingAdapter((task, out) => (task === "back_translate" ? out.replace("100 mg", "200 mg") : out));
    const states: string[] = [];
    const r = await runPipeline(
      { ai: createAi({ mock: true, adapter }), config: cfg, onAttempt: async (s) => void states.push(s.state) },
      { ...base, source: "Take 100 mg twice daily." },
    );
    expect(r.state).toBe("held");
    expect(r.tier).toBe("held");
    const translates = calls.filter((c) => c.task === "translate_message");
    expect(translates).toHaveLength(cfg.maxRetries + 1);
    expect(JSON.parse(translates[0].input).feedback).toEqual([]);
    expect(JSON.parse(translates[1].input).feedback.join(" ")).toMatch(/100 mg/);
    expect(states).toEqual(["flagged", "flagged", "held"]);
    expect(r.trace.attempt).toBe(3);
    expect(r.trace.steps.filter((s) => s.name === "translate")).toHaveLength(3);
    expect(r.trace.finalState).toBe("held");
  });

  it("recovers on retry when the second attempt is clean", async () => {
    let n = 0;
    const { adapter } = recordingAdapter((task, out) => (task === "back_translate" && n++ === 0 ? out.replace("not ", "") : out));
    const r = await runPipeline({ ai: createAi({ mock: true, adapter }), config: cfg }, { ...base, source: "Do not drive today." });
    expect(r.state).toBe("ready_for_doctor");
    expect(r.tier).toBe("verify");
    expect(r.trace.attempt).toBe(2);
  });

  it("weak language and consent are held", async () => {
    const ai = createAi({ mock: true });
    expect((await runPipeline({ ai, config: cfg }, { ...base, targetLang: "xx", source: "Hello" })).state).toBe("held");
    expect((await runPipeline({ ai, config: cfg }, { ...base, source: "Please sign the consent form." })).state).toBe("held");
  });

  it("pseudonymises before translate and restores after backTranslate (H2)", async () => {
    const order: string[] = [];
    const { adapter, calls } = recordingAdapter();
    const spyAdapter: AiAdapter = { complete: (t, i, m) => (order.push(t), adapter.complete(t, i, m)) };
    const privacy = {
      pseudonymise: vi.fn((t: string, ids?: Identifiers) => (order.push("pseudonymise"), pseudonymise(t, ids))),
      restore: vi.fn((t: string, map: PseudoMap) => (order.push("restore"), restore(t, map))),
    };
    const r = await runPipeline(
      { ai: createAi({ mock: true, adapter: spyAdapter }), config: cfg, privacy },
      { ...base, source: `Hello ${NAME}, take 5 mg now.` },
    );
    expect(order[0]).toBe("pseudonymise");
    expect(order.indexOf("restore")).toBeGreaterThan(order.indexOf("back_translate"));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.input).not.toMatch(/Testa|Personne/);
    expect(r.backTranslation).toContain(NAME);
    expect(r.translation).toContain(NAME);
  });

  it("patient line: English only, ai_checked or needs_checking, no tier", async () => {
    const { adapter, calls } = recordingAdapter();
    const p = { messageId: "p1", source: "J'ai mal depuis 2 days", sourceLang: "fr", ids: {}, now: () => new Date(0) };
    const r = await runPatientPipeline({ ai: createAi({ mock: true, adapter }), config: cfg }, p);
    expect(r.state).toBe("ai_checked");
    expect("tier" in r).toBe(false);
    expect(JSON.parse(calls[0].input).to).toBe("en");
    const failing = recordingAdapter((task, out) => (task === "verify_translation" ? JSON.stringify({ passed: false, errors: [] }) : out));
    const r2 = await runPatientPipeline({ ai: createAi({ mock: true, adapter: failing.adapter }), config: cfg }, p);
    expect(r2.state).toBe("needs_checking");
  });
});

describe("model families (F7)", () => {
  it("translator, backTranslator and aiVerifier are different strings and families", () => {
    const t = appConfig.translation;
    expect(new Set([t.translator.model, t.backTranslator.model, t.aiVerifier.model]).size).toBe(3);
    expect(new Set([t.translator.family, t.backTranslator.family, t.aiVerifier.family]).size).toBe(3);
    expect(() => assertDistinctFamilies({ ...t, aiVerifier: { ...t.translator } })).toThrow();
  });
});
