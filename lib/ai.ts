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
  | "draft_pack";

/** A provider. Receives pseudonymised JSON text and returns JSON text. */
export interface AiAdapter {
  complete(task: AiTask, input: string): Promise<string>;
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
  translateMessage(text: string, from: string, to: string, ids?: Identifiers): Promise<string>;
  backTranslate(text: string, from: string, to: string, ids?: Identifiers): Promise<string>;
  /** Plain-language rewording in the patient's language. Relays only what was entered. */
  draftPack(input: PackDraftInput, language: string, ids?: Identifiers): Promise<PackDraftInput>;
}

export function createAi(opts: { mock: boolean; adapter?: AiAdapter }): Ai {
  const adapter = opts.adapter ?? (opts.mock ? mockAdapter : providerAdapter);

  async function call<T>(task: AiTask, payload: unknown, ids: Identifiers = {}): Promise<T> {
    const { text, map } = pseudonymise(JSON.stringify(payload), ids);
    const out = await adapter.complete(task, text);
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
    async translateMessage(text, from, to, ids) {
      return (await call<{ text: string }>("translate_message", { text, from, to }, ids)).text;
    },
    async backTranslate(text, from, to, ids) {
      return (await call<{ text: string }>("back_translate", { text, from, to }, ids)).text;
    },
    draftPack: (input, language, ids) => call("draft_pack", { ...input, language }, ids),
  };
}
