// Reads data/config.json (clinician-owned) and falls back to data/demo-defaults.json only where a value
// is still a TODO(clinician) placeholder. Fixed wording is NEVER taken from demo defaults: it stays a
// visible placeholder until a clinician writes it.
import config from "@/data/config.json";
import demo from "@/data/demo-defaults.json";
import phrasesFile from "@/data/phrases.json";

const isTodo = (v: unknown): boolean => typeof v === "string" && v.includes("TODO");

const fallbacks: string[] = [];

function num(key: string, value: unknown, demoValue: number): number {
  if (typeof value === "number") return value;
  if (!isTodo(value)) throw new Error(`config.${key} must be a number or TODO(clinician)`);
  fallbacks.push(key);
  return demoValue;
}

function list(key: string, value: unknown, demoValue: string[]): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!isTodo(value)) throw new Error(`config.${key} must be a list or TODO(clinician)`);
  fallbacks.push(key);
  return demoValue;
}

function scale(value: unknown): { min: number; max: number } {
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    const v = value as { min: number; max: number };
    return { min: v.min, max: v.max };
  }
  if (!isTodo(value)) throw new Error("config.priorityScale must be {min,max} or TODO(clinician)");
  fallbacks.push("priorityScale");
  return { min: demo.priorityScale.min, max: demo.priorityScale.max };
}

export type Tier = "urgent" | "high" | "routine";

export interface ModelChoice {
  model: string;
  family: string;
}

export interface TranslationConfig {
  translator: ModelChoice;
  backTranslator: ModelChoice;
  aiVerifier: ModelChoice;
  /** Consent-type messages are never delivered by the app (CLAUDE.md rule 11). */
  consentRequiresInterpreter: boolean;
  /** Messages to patients with these languages are always held and escalated. */
  weakLanguages: string[];
  maxRetries: number;
}

export interface AppConfig {
  columns: string[];
  doneRetentionMinutes: number;
  longWaitMinutes: number;
  priorityScale: { min: number; max: number };
  idPrefix: string;
  idStart: number;
  enquiry: {
    redFlagPhrases: string[];
    categories: string[];
    /** null while the clinician table is still TODO; rules must then send items to nurse review. */
    categoryToBaseTier: Record<string, Tier> | null;
    waitBumpMinutes: number;
    lowConfidenceBelow: number;
  };
  /** Fixed text shown for "I feel worse". May be a TODO(clinician) placeholder: show it as is. */
  urgentText: Record<string, string>;
  noteTemplateSections: string[];
  /** null while the clinician list is still TODO. */
  testCatalogue: string[] | null;
  doctors: { id: string; name: string; cubicle: string }[];
  translation: TranslationConfig;
  /** Fixed "when to seek help" wording. May be a TODO(clinician) placeholder. Never AI-generated. */
  whenToSeekHelpText: string;
  /** Keys that are currently using DEMO-ONLY values from data/demo-defaults.json. */
  demoDefaultsInUse: string[];
}

function model(key: string, value: unknown, demoValue: ModelChoice): ModelChoice {
  const v = (value ?? {}) as Partial<ModelChoice>;
  if (typeof v.model === "string" && typeof v.family === "string" && !isTodo(v.model) && !isTodo(v.family)) {
    return { model: v.model, family: v.family };
  }
  fallbacks.push(key);
  return demoValue;
}

/** CLAUDE.md rule 11: translator, back-translator and verifier must be three different model families. */
export function assertDistinctFamilies(t: Pick<TranslationConfig, "translator" | "backTranslator" | "aiVerifier">) {
  const fams = [t.translator.family, t.backTranslator.family, t.aiVerifier.family].map((f) => f.trim().toLowerCase());
  if (new Set(fams).size !== 3) {
    throw new Error(`config.translation: translator, backTranslator and aiVerifier must use three different families (got ${fams.join(", ")})`);
  }
}

function translation(t: Record<string, any> = {}): TranslationConfig {
  const d = demo.translation;
  const out: TranslationConfig = {
    translator: model("translation.translator", t.translator, d.translator),
    backTranslator: model("translation.backTranslator", t.backTranslator, d.backTranslator),
    aiVerifier: model("translation.aiVerifier", t.aiVerifier, d.aiVerifier),
    consentRequiresInterpreter: t.consentRequiresInterpreter !== false,
    weakLanguages: list("translation.weakLanguages", t.weakLanguages ?? "TODO", d.weakLanguages),
    maxRetries: typeof t.maxRetries === "number" ? t.maxRetries : 2,
  };
  assertDistinctFamilies(out);
  return out;
}

function build(): AppConfig {
  const c = config as Record<string, any>;
  const e = c.enquiry ?? {};
  const urgent: Record<string, string> = {};
  for (const [lang, text] of Object.entries(c.urgentText ?? {})) {
    if (lang !== "otherLanguages") urgent[lang] = String(text);
  }
  const tierTable = e.categoryToBaseTier;
  const catalogue = c.testCatalogue;

  const out: AppConfig = {
    columns: c.columns,
    doneRetentionMinutes: num("doneRetentionMinutes", c.doneRetentionMinutes, demo.doneRetentionMinutes),
    longWaitMinutes: num("longWaitMinutes", c.longWaitMinutes, demo.longWaitMinutes),
    priorityScale: scale(c.priorityScale),
    idPrefix: demo.idPrefix,
    idStart: demo.idStart,
    enquiry: {
      redFlagPhrases: list("enquiry.redFlagPhrases", e.redFlagPhrases, demo.enquiry.redFlagPhrases),
      categories: e.categories,
      categoryToBaseTier: tierTable && typeof tierTable === "object" ? tierTable : null,
      waitBumpMinutes: num("enquiry.waitBumpMinutes", e.waitBumpMinutes, demo.enquiry.waitBumpMinutes),
      lowConfidenceBelow: typeof e.lowConfidenceBelow === "number" ? e.lowConfidenceBelow : 0.6,
    },
    urgentText: urgent,
    noteTemplateSections: c.noteTemplate?.sections ?? [],
    testCatalogue: Array.isArray(catalogue) ? catalogue : null,
    doctors: c.doctors,
    translation: translation(c.translation),
    whenToSeekHelpText: String(c.resultsPack?.whenToSeekHelpText ?? "TODO(clinician)"),
    demoDefaultsInUse: [...fallbacks],
  };
  return out;
}

export const appConfig: AppConfig = build();

// ---------------------------------------------------------------------------
// Pre-verified phrases (data/phrases.json)
// ---------------------------------------------------------------------------

export interface PhraseEntry {
  text: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

/** phrases[key][language] */
export type PhraseTable = Record<string, Record<string, PhraseEntry>>;

export const phraseTable: PhraseTable = (phrasesFile as { phrases: PhraseTable }).phrases ?? {};
