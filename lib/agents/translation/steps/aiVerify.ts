import type { Ai } from "@/lib/ai";
import type { RuleError } from "./ruleCheck";

export interface AiVerifyResult {
  passed: boolean;
  errors: Array<{ kind: string; detail: string; severity: string }>;
  model: string;
}

/**
 * AI verifier step (a third model family). A check only, never a source of text.
 * MOCK_AI=1: the fixture passes everything. TODO(ai): real provider behind lib/ai.ts.
 */
export async function aiVerify(
  ai: Ai,
  i: { source: string; translation: string; backTranslation: string; ruleErrors: RuleError[]; model: string },
): Promise<AiVerifyResult> {
  const v = await ai.verifyTranslation(
    { source: i.source, translation: i.translation, backTranslation: i.backTranslation, ruleErrors: i.ruleErrors },
    {},
    { model: i.model },
  );
  return { passed: v.passed === true, errors: Array.isArray(v.errors) ? v.errors : [], model: ai.mock ? "mock" : i.model };
}
