// Agent decision (SPEC section 9 step 5). Called once the retries are over.
import type { MessageTier } from "@/lib/contracts";
import { hasSafetyItems } from "./ruleCheck";

/** TODO(clinician): hardcoded consent keywords; a clinician must confirm this list. */
export const CONSENT_KEYWORDS = ["consent", "sign", "agree", "permission", "procedure", "operation", "risks", "benefits"];

export type DecisionReason = "consent" | "weak_language" | "rule_check_failed" | "ai_verify_failed" | "safety_items";

export interface DecisionInput {
  source: string;
  targetLang: string;
  ruleCheck: { passed: boolean };
  aiVerify: { passed: boolean };
  config: { consentRequiresInterpreter: boolean; weakLanguages: string[] };
}

export function hasConsentKeyword(text: string): boolean {
  const t = text.toLowerCase();
  return CONSENT_KEYWORDS.some((k) => new RegExp(`(?<![a-z])${k}(?![a-z])`).test(t));
}

export function isWeakLanguage(lang: string, weak: string[]): boolean {
  return weak.map((w) => w.toLowerCase()).includes(lang.toLowerCase());
}

/** Reasons that hold a message no matter what the checks say (no retry can fix them). */
export function preHoldReasons(i: Pick<DecisionInput, "source" | "targetLang" | "config">): DecisionReason[] {
  const r: DecisionReason[] = [];
  if (i.config.consentRequiresInterpreter && hasConsentKeyword(i.source)) r.push("consent");
  if (isWeakLanguage(i.targetLang, i.config.weakLanguages)) r.push("weak_language");
  return r;
}

export function decide(i: DecisionInput): { tier: MessageTier; reasons: DecisionReason[] } {
  const reasons = preHoldReasons(i);
  if (!i.ruleCheck.passed) reasons.push("rule_check_failed");
  if (!i.aiVerify.passed) reasons.push("ai_verify_failed");
  if (reasons.length) return { tier: "held", reasons };
  if (hasSafetyItems(i.source)) return { tier: "verify", reasons: ["safety_items"] };
  return { tier: "routine", reasons: [] };
}
