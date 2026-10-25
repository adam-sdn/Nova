import { describe, expect, it } from "vitest";
import { inboxTier, suggestEnquiryPriority } from "./priority";

describe("suggestEnquiryPriority (hardcoded, no AI)", () => {
  it("suggests Urgent for breath or chest", () => {
    expect(suggestEnquiryPriority("It is hard to breathe").tier).toBe("urgent");
    expect(suggestEnquiryPriority("short of BREATH").tier).toBe("urgent");
    expect(suggestEnquiryPriority("My chest feels tight").tier).toBe("urgent");
  });
  it("suggests High for pain or dizzy", () => {
    expect(suggestEnquiryPriority("My stomach pain is worse").tier).toBe("high");
    expect(suggestEnquiryPriority("I feel Dizzy").tier).toBe("high");
  });
  it("Urgent wins over High when both match", () => {
    expect(suggestEnquiryPriority("chest pain").tier).toBe("urgent");
  });
  it("suggests Routine for everything else", () => {
    expect(suggestEnquiryPriority("Could I have some water?").tier).toBe("routine");
    expect(suggestEnquiryPriority("").tier).toBe("routine");
  });
  it("gives a one-line reason", () => {
    expect(suggestEnquiryPriority("chest").reason).toMatch(/chest/);
  });
});

describe("inboxTier: the suggestion never lowers a server tier (rule 4)", () => {
  it("keeps urgent from the server even when the text looks routine", () => {
    expect(inboxTier("urgent", "routine")).toBe("urgent");
    expect(inboxTier("urgent", "high")).toBe("urgent");
  });
  it("keeps a set tier: the hardcoded suggestion does not change it", () => {
    expect(inboxTier("routine", "urgent")).toBe("routine");
    expect(inboxTier("high", "routine")).toBe("high");
  });
  it("uses the suggestion only to fill an unclassified tier, and only upwards", () => {
    expect(inboxTier("needs_review", "urgent")).toBe("urgent");
    expect(inboxTier("needs_review", "high")).toBe("high");
    expect(inboxTier("needs_review", "routine")).toBe("needs_review");
  });
});
