import type { Ai } from "@/lib/ai";

export interface BackTranslateOutput {
  backTranslation: string;
  model: string;
}

/**
 * Back-translator step (a different model family from the translator, checked at config load).
 * TODO(ai): with MOCK_AI=0 a real provider is needed behind lib/ai.ts.
 */
export async function backTranslate(
  ai: Ai,
  i: { translation: string; translationLang: string; backLang: string; model: string },
): Promise<BackTranslateOutput> {
  const backTranslation = await ai.backTranslate(i.translation, i.translationLang, i.backLang, {}, { model: i.model });
  return { backTranslation, model: i.model };
}
