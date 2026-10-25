import { describe, expect, it } from "vitest";
import { extractSafetyItems, ruleCheck } from "./steps/ruleCheck";

const kinds = (r: ReturnType<typeof ruleCheck>) => r.errors.map((e) => `${e.kind}:${e.severity}`);

describe("ruleCheck (ACCEPTANCE F1)", () => {
  it("passes identical text", () => {
    const s = "Take 100 mg paracetamol twice daily. Do not drive.";
    expect(ruleCheck(s, s)).toEqual({ passed: true, errors: [] });
  });

  it("dose changed 100mg -> 200mg is critical", () => {
    const r = ruleCheck("Take 100mg of ibuprofen.", "Take 200mg of ibuprofen.");
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toMatchObject({ kind: "number_unit", source: "100 mg", found: "200 mg", severity: "critical" });
  });

  it("unit changed mg -> ml is critical", () => {
    const r = ruleCheck("Take 5 mg now.", "Take 5 ml now.");
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toMatchObject({ kind: "number_unit", source: "5 mg", found: "5 ml", severity: "critical" });
  });

  it('"not" dropped is critical', () => {
    const r = ruleCheck("You should not eat before the scan.", "You should eat before the scan.");
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toMatchObject({ kind: "negation", source: "not", found: null, severity: "critical" });
  });

  it('"do not" counted once, not also as "not"', () => {
    expect(extractSafetyItems("Do not stop the tablets.").negations).toEqual(["do not", "stop"]);
    expect(ruleCheck("Don't drive.", "Do not drive.").passed).toBe(true);
  });

  it("drug name missing (or swapped) is critical", () => {
    const r = ruleCheck("Take amoxicillin with food.", "Take ibuprofen with food.");
    expect(r.passed).toBe(false);
    expect(r.errors).toContainEqual({ kind: "drug", source: "amoxicillin", found: "ibuprofen", severity: "critical" });
    expect(ruleCheck("Take amoxicillin.", "Take the tablet.").errors[0]).toMatchObject({ kind: "drug", found: null });
  });

  it("time shifted morning -> evening is a warning (still passes)", () => {
    const r = ruleCheck("Take it in the morning.", "Take it in the evening.");
    expect(r.passed).toBe(true);
    expect(r.errors).toEqual([{ kind: "time", source: "morning", found: "evening", severity: "warning" }]);
  });

  it("every N hours is a time, changed N is reported", () => {
    const r = ruleCheck("Take one every 4 hours.", "Take one every 6 hours.");
    expect(kinds(r)).toContain("time:warning");
    expect(r.errors.find((e) => e.kind === "time")).toMatchObject({ source: "every 4 hours", found: "every 6 hours" });
  });

  it("extra number added is critical", () => {
    const r = ruleCheck("Take the tablet.", "Take 2 tablets.");
    expect(r.passed).toBe(false);
    expect(r.errors[0]).toMatchObject({ kind: "extra_number", source: "", found: "2 tablets", severity: "critical" });
  });

  it("allergy word missing is a warning", () => {
    const r = ruleCheck("Tell us if you are allergic to anything.", "Tell us if you have anything.");
    expect(r.errors).toEqual([{ kind: "allergy", source: "allergic", found: null, severity: "warning" }]);
    expect(r.passed).toBe(true);
  });

  it("ignores pseudonym tokens such as [[NAME_1]]", () => {
    expect(extractSafetyItems("Hello [[NAME_1]]").numbers).toEqual([]);
  });
});
