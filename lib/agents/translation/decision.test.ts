import { describe, expect, it } from "vitest";
import { decide, CONSENT_KEYWORDS } from "./steps/decision";

const cfg = { consentRequiresInterpreter: true, weakLanguages: ["xx"] };
const ok = { passed: true, errors: [] };
const bad = { passed: false, errors: [{ kind: "number_unit", source: "1 mg", found: null, severity: "critical" as const }] };
const run = (source: string, targetLang = "fr", ruleCheck = ok, aiVerify: { passed: boolean; errors: unknown[] } = ok) =>
  decide({ source, targetLang, ruleCheck, aiVerify, config: cfg });

describe("decision", () => {
  it("routine: clean and no safety items", () => {
    expect(run("Hello, how are you feeling?").tier).toBe("routine");
  });
  it("verify: checks passed but safety items present", () => {
    for (const s of ["Take 100 mg.", "Take paracetamol.", "Do not drive.", "Any allergy?", "Take it daily."]) {
      expect(run(s).tier).toBe("verify");
    }
  });
  it("held: rule check failure after retries", () => {
    expect(run("Take 1 mg.", "fr", bad).tier).toBe("held");
  });
  it("held: AI verifier failed after retries", () => {
    expect(run("Hi", "fr", ok, { passed: false, errors: [] }).tier).toBe("held");
  });
  it("held: consent keyword", () => {
    expect(CONSENT_KEYWORDS).toContain("consent");
    const d = run("We need you to sign a form for the operation.");
    expect(d.tier).toBe("held");
    expect(d.reasons).toContain("consent");
  });
  it("held: weak language", () => {
    expect(run("Hello", "xx")).toMatchObject({ tier: "held", reasons: ["weak_language"] });
  });
  it("consent keywords match whole words only", () => {
    expect(run("These are signs of a cold.").tier).toBe("routine");
  });
});
