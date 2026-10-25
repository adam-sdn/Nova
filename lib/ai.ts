// The ONLY module that talks to an AI provider (CLAUDE.md rule 6).
// Every call pseudonymises its input first and restores identifiers in the output afterwards (rule 7),
// so the adapter never receives a patient's name or other identifiers.
// AI output here is a draft or a suggestion only. It never sets priority, urgency, diagnoses, doses,
// test orders or outcomes (rule 3), and fixed clinical wording never comes from here (rule 5).
import { pseudonymise, restore, type Identifiers } from "@/lib/privacy/crypto";
import { mockAdapter } from "./ai.fixtures";

export type AiTask =
  | "translate_intake"
  | "classify_enquiry"
  | "summarise_patient"
  | "draft_note"
  | "translate_message"
  | "back_translate"
  | "verify_translation"
  | "draft_pack"
  | "draft_follow_ups";

/**
 * A provider. Receives pseudonymised JSON text and returns JSON text. `model` is the model named in
 * config.translation for translation-agent calls (translator, back-translator and verifier are three
 * different families, CLAUDE.md rule 11); other tasks leave it undefined.
 */
export interface AiAdapter {
  complete(task: AiTask, input: string, model?: string): Promise<string>;
}

/** Placeholder for a real provider. Not wired up: adding one needs approval (CLAUDE.md rule 10). */
const providerAdapter: AiAdapter = {
  async complete() {
    throw new Error("AI provider not configured. Set MOCK_AI=1 or add a provider in lib/ai.ts.");
  },
};

export interface IntakeTranslation {
  english: string;
  original: string;
}

export interface EnquiryClassification {
  category: string;
  confidence: number;
  reason: string;
}

export interface PatientSummary {
  summary: string;
  keyPoints: string[];
}

export interface DraftNoteSection {
  text: string;
  /** Conversation lines this text came from, 1-based and inclusive. */
  fromLine: number;
  toLine: number;
}

/** One error from the AI verifier (SPEC section 9). */
export interface TranslationIssue {
  kind: "accuracy" | "omission" | "addition" | "negation" | "terminology" | string;
  detail: string;
  severity: "critical" | "warning" | string;
}

export interface TranslationVerdict {
  passed: boolean;
  errors: TranslationIssue[];
}

export interface TranslationCallOpts {
  model?: string;
  /** Errors from a previous attempt, so the translator can fix them ("preserve numbers verbatim"). */
  feedback?: string[];
}

/** A follow-up task drafted from a signed note. A suggestion only: the doctor confirms, edits or dismisses it. */
export interface FollowUpDraft {
  text: string;
  /** The note section it came from. */
  fromSection: string;
}

export interface PackDraftInput {
  results: string;
  advice: string;
  medicines: string[];
}

export interface Ai {
  readonly mock: boolean;
  translateIntake(text: string, language: string, ids?: Identifiers): Promise<IntakeTranslation>;
  classifyEnquiry(text: string, ids?: Identifiers): Promise<EnquiryClassification>;
  summarisePatient(input: { reason: string; triageNote: string; enquiries: string[] }, ids?: Identifiers): Promise<PatientSummary>;
  draftNote(transcript: string[], sections: string[], ids?: Identifiers): Promise<Record<string, DraftNoteSection>>;
  translateMessage(text: string, from: string, to: string, ids?: Identifiers, opts?: TranslationCallOpts): Promise<string>;
  backTranslate(text: string, from: string, to: string, ids?: Identifiers, opts?: TranslationCallOpts): Promise<string>;
  /** The AI verifier: compares source, translation and back-translation. A check, never a source of text. */
  verifyTranslation(
    input: { source: string; translation: string; backTranslation: string; ruleErrors: unknown[] },
    ids?: Identifiers,
    opts?: TranslationCallOpts,
  ): Promise<TranslationVerdict>;
  /** Plain-language rewording in the patient's language. Relays only what was entered. */
  draftPack(input: PackDraftInput, language: string, ids?: Identifiers): Promise<PackDraftInput>;
  /** Follow-up tasks from the signed note and the tests ordered. Relays only what the doctor wrote. */
  draftFollowUps(input: { sections: Record<string, string>; tests: string[] }, ids?: Identifiers): Promise<FollowUpDraft[]>;
}

export function createAi(opts: { mock: boolean; adapter?: AiAdapter }): Ai {
  const adapter = opts.adapter ?? (opts.mock ? mockAdapter : providerAdapter);

  async function call<T>(task: AiTask, payload: unknown, ids: Identifiers = {}, model?: string): Promise<T> {
    const { text, map } = pseudonymise(JSON.stringify(payload), ids);
    const out = await adapter.complete(task, text, model);
    return JSON.parse(restore(out, map)) as T;
  }

  return {
    mock: opts.mock,
    async translateIntake(text, language, ids) {
      const r = await call<{ english: string }>("translate_intake", { text, language }, ids);
      return { english: r.english, original: text };
    },
    classifyEnquiry: (text, ids) => call("classify_enquiry", { text }, ids),
    summarisePatient: (input, ids) => call("summarise_patient", input, ids),
    draftNote: (transcript, sections, ids) => call("draft_note", { transcript, sections }, ids),
    async translateMessage(text, from, to, ids, opts) {
      const payload = { text, from, to, feedback: opts?.feedback ?? [] };
      return (await call<{ text: string }>("translate_message", payload, ids, opts?.model)).text;
    },
    async backTranslate(text, from, to, ids, opts) {
      return (await call<{ text: string }>("back_translate", { text, from, to }, ids, opts?.model)).text;
    },
    verifyTranslation: (input, ids, opts) => call("verify_translation", input, ids, opts?.model),
    draftPack: (input, language, ids) => call("draft_pack", { ...input, language }, ids),
    async draftFollowUps(input, ids) {
      return (await call<{ items: FollowUpDraft[] }>("draft_follow_ups", input, ids)).items;
    },
  };
}
