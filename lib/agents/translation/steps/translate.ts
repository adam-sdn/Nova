import type { Ai } from "@/lib/ai";

export interface TranslateInput {
  source: string;
  sourceLang: string;
  targetLang: string;
  feedback?: string[];
  attempt: number;
  model: string;
}
export interface TranslateOutput {
  translation: string;
  model: string;
  attempt: number;
}

/**
 * Translator step. Goes through lib/ai.ts: with MOCK_AI=1 the fixture returns a mock translation;
 * TODO(ai): with MOCK_AI=0 a real provider is needed behind lib/ai.ts (translator model from config).
 * `source` must already be pseudonymised.
 */
export async function translate(ai: Ai, i: TranslateInput): Promise<TranslateOutput> {
  const translation = await ai.translateMessage(i.source, i.sourceLang, i.targetLang, {}, { model: i.model, feedback: i.feedback ?? [] });
  return { translation, model: i.model, attempt: i.attempt };
}
