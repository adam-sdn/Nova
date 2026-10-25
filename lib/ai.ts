// The ONLY module that talks to an AI provider (CLAUDE.md rule 6).
// Every call pseudonymises its input first and restores identifiers in the output afterwards (rule 7),
// so the adapter never receives a patient's name or other identifiers.
// AI output here is a draft or a suggestion only. It never sets priority, urgency, diagnoses, doses,
// test orders or outcomes (rule 3), and fixed clinical wording never comes from here (rule 5).
import { execFile } from "node:child_process";
import path from "node:path";
import { pseudonymise, restore, type Identifiers } from "@/lib/privacy/crypto";
import { mockAdapter } from "./ai.fixtures";
import { systemPrompt } from "./ai.prompts";
import type { SpeechLanguage } from "@/lib/voice/languages";

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

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const TRANSLATION_TASKS = new Set<AiTask>(["translate_message", "back_translate", "verify_translation"]);

type Fetch = typeof fetch;

/** Google Gemini (approved for the agent tasks). Receives pseudonymised text only; the key stays server-side. */
export async function callGemini(model: string, task: AiTask, input: string, f: Fetch = fetch): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI provider not configured: GEMINI_API_KEY is not set in .env.local");
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(task) }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Gemini ${res.status}: ${err?.error?.message?.slice(0, 200) ?? res.statusText}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/** A local Ollama model, for config entries named "ollama:<model>". */
export async function callOllama(model: string, task: AiTask, input: string, f: Fetch = fetch): Promise<string> {
  // 127.0.0.1, not localhost: Node may resolve localhost to ::1, where Ollama does not listen by default.
  const res = await f(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      think: false,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: systemPrompt(task) },
        { role: "user", content: input },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status} for ${model}`);
  const data = (await res.json()) as { message?: { content?: string } };
  if (!data.message?.content) throw new Error("Ollama returned no text");
  return data.message.content;
}

/**
 * The real provider. Translation-agent calls follow the model named in config.translation: "gemini:<model>" or
 * "ollama:<model>"; any other name is a demo placeholder and gets the labelled mock fixture (demo translation).
 * Every other task uses Gemini.
 */
export function providerAdapter(f: Fetch = fetch): AiAdapter {
  return {
    async complete(task, input, model) {
      if (model?.startsWith("ollama:")) return callOllama(model.slice("ollama:".length), task, input, f);
      if (model?.startsWith("gemini:")) return callGemini(model.slice("gemini:".length), task, input, f);
      if (TRANSLATION_TASKS.has(task)) return mockAdapter.complete(task, input);
      return callGemini(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, task, input, f);
    },
  };
}

// ---------------------------------------------------------------------------
// Speech-to-text: OpenWhispr's local models, through its CLI and the desktop app's local bridge.
// Audio cannot be pseudonymised, so only a local provider is allowed here: --local never falls back to the cloud.
// ---------------------------------------------------------------------------

export { SPEECH_LANGUAGES, type SpeechLanguage } from "@/lib/voice/languages";

export type RunCli = (cmd: string, args: string[]) => Promise<string>;

const runCli: RunCli = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const reason = String(stderr || err.message).split("\n")[0].slice(0, 200);
        reject(new Error(err.killed ? "Speech-to-text timed out" : `OpenWhispr: ${reason}`));
      } else resolve(stdout);
    });
  });

/** node + the CLI's script, so no shell is involved (Windows npm shims are .cmd/.ps1 files). */
function openWhisprCommand(): { cmd: string; prefix: string[] } {
  const script =
    process.env.OPENWHISPR_CLI ??
    (process.platform === "win32" && process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "@openwhispr", "cli", "dist", "index.js")
      : null);
  return script ? { cmd: process.execPath, prefix: [script] } : { cmd: "openwhispr", prefix: [] };
}

export async function transcribe(wavPath: string, language: SpeechLanguage, run: RunCli = runCli): Promise<string> {
  const { cmd, prefix } = openWhisprCommand();
  const model = process.env.OPENWHISPR_MODEL;
  const out = await run(cmd, [
    ...prefix,
    "--local",
    "transcribe",
    wavPath,
    "--language",
    language,
    "--format",
    "json",
    ...(model ? ["--model", model] : []),
  ]);
  const parsed = JSON.parse(out) as { text?: unknown };
  return typeof parsed.text === "string" ? parsed.text.trim() : "";
}

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
  const adapter = opts.adapter ?? (opts.mock ? mockAdapter : providerAdapter());

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
