// Server-side only: the fixed "I feel worse" wording (CLAUDE.md hard rule 5). Never AI-generated.
import { appConfig } from "@/lib/config";

/** Fixed clinician wording from data/config.json for this language, falling back to English. */
export function urgentWordingFor(language: string): string {
  // TODO(clinician): other languages must be translated by a fluent speaker and verified before use.
  return appConfig.urgentText[language] ?? appConfig.urgentText.en ?? "TODO(clinician)";
}
