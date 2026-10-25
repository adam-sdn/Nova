import { describe, expect, it } from "vitest";
import { appConfig, assertDistinctFamilies } from "@/lib/config";

describe("translation config (CLAUDE.md rule 11)", () => {
  it("the loaded config uses three different model families", () => {
    const t = appConfig.translation;
    expect(() => assertDistinctFamilies(t)).not.toThrow();
    expect(t.maxRetries).toBeGreaterThanOrEqual(0);
    expect(t.consentRequiresInterpreter).toBe(true);
  });

  it("rejects config where two roles share a family", () => {
    const m = (family: string) => ({ model: `m-${family}`, family });
    expect(() => assertDistinctFamilies({ translator: m("a"), backTranslator: m("A"), aiVerifier: m("c") })).toThrow(/three different/);
  });
});
