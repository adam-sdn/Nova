// The ONLY module that talks to an AI provider (CLAUDE.md rule 6).
// Every call pseudonymises its input first and restores identifiers in the output afterwards (rule 7),
// so the adapter never receives a patient's name or other identifiers.
// AI output here is a draft or a suggestion only. It never sets priority, urgency, diagnoses, doses,
// test orders or outcomes (rule 3), and fixed clinical wording never comes from here (rule 5).
import { pseudonymise, restore, type Identifiers } from "@/lib/privacy/crypto";
import { mockAdapter } from "./ai.fixtures";
import { systemPrompt } from "./ai.prompts";

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

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const TRANSLATION_TASKS = new Set<AiTask>(["translate_message", "back_translate", "verify_translation"]);

type Fetch = typeof fetch;

/**
 * Google's Gemini API (approved for the agent tasks): Gemini models, and Gemma models through the same key.
 * Receives pseudonymised text only; the key stays server-side.
 */
export async function callGemini(model: string, task: AiTask, input: string, f: Fetch = fetch): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI provider not configured: GEMINI_API_KEY is not set in .env.local");
  // Google's models fail now and then (500, 503, overload, hangs): retry once, then try a sibling model of the
  // same family, so the translator, back-translator and verifier stay three different families (rule 11).
  const family = model.startsWith("gemma") ? "gemma" : "gemini";
  const attempts = [model, model, ...GOOGLE_FALLBACKS[family].filter((m) => m !== model)];
  let last = new Error("Gemini API unavailable");
  for (const m of attempts) {
    try {
      return await callGoogleOnce(m, task, input, key, f);
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      const status = (e as { status?: number }).status;
      // A bad key or bad request will not get better by retrying.
      if (status !== undefined && !RETRYABLE.has(status)) throw last;
    }
  }
  throw last;
}

const GOOGLE_FALLBACKS: Record<"gemini" | "gemma", string[]> = {
  gemini: ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
  gemma: ["gemma-4-26b-a4b-it"],
};
const RETRYABLE = new Set([404, 408, 429, 500, 502, 503, 504]);

async function callGoogleOnce(model: string, task: AiTask, input: string, key: string, f: Fetch): Promise<string> {
  // Gemma on this API takes no system instruction and no JSON mode, so the prompt goes in the message.
  const gemma = model.startsWith("gemma");
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      ...(gemma ? {} : { systemInstruction: { parts: [{ text: systemPrompt(task) }] } }),
      contents: [{ role: "user", parts: [{ text: gemma ? `${systemPrompt(task)}\n\nInput:\n${input}` : input }] }],
      generationConfig: { temperature: 0.1, ...(gemma ? {} : { responseMimeType: "application/json" }) },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw Object.assign(new Error(`Gemini API ${res.status}: ${err?.error?.message?.slice(0, 200) ?? res.statusText}`), { status: res.status });
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw Object.assign(new Error("Gemini API returned no text"), { status: 500 });
  return gemma ? jsonOnly(text) : text;
}

/** The JSON object inside a reply that may be wrapped in a ```json fence or prose. */
function jsonOnly(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON");
  return text.slice(start, end + 1);
}

/** MyMemory codes where they differ from ours. */
const MYMEMORY_LANG: Record<string, string> = { zh: "zh-CN" };

/**
 * MyMemory (api.mymemory.translated.net), a free machine-translation service: the translator step only.
 * The text goes in the POST body, never in the URL. MYMEMORY_EMAIL raises the free daily limit.
 */
export async function callMyMemory(task: AiTask, input: string, f: Fetch = fetch): Promise<string> {
  if (task !== "translate_message" && task !== "back_translate") throw new Error(`MyMemory cannot do ${task}`);
  const { text, from, to } = JSON.parse(input) as { text: string; from: string; to: string };
  if (from === to) return JSON.stringify({ text });
  const form = new URLSearchParams({ q: text, langpair: `${MYMEMORY_LANG[from] ?? from}|${MYMEMORY_LANG[to] ?? to}` });
  if (process.env.MYMEMORY_EMAIL) form.set("de", process.env.MYMEMORY_EMAIL);
  const res = await f("https://api.mymemory.translated.net/get", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = (await res.json()) as { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } };
  const out = data.responseData?.translatedText ?? "";
  if (data.quotaFinished || /^MYMEMORY WARNING/i.test(out)) throw new Error("MyMemory daily limit reached");
  if (Number(data.responseStatus) !== 200 || !out) throw new Error("MyMemory could not translate this text");
  return JSON.stringify({ text: decodeEntities(out) });
}

function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (e[0] !== "#") return named[e.toLowerCase()] ?? m;
    return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
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
 * The real provider. Translation-agent calls follow the model named in config.translation: "mymemory",
 * "gemini:<model>" (Gemini or Gemma) or "ollama:<model>"; any other name is a demo placeholder and gets the
 * labelled mock fixture. Every other task uses Gemini.
 */
export function providerAdapter(f: Fetch = fetch): AiAdapter {
  return {
    async complete(task, input, model) {
      if (model === "mymemory") return callMyMemory(task, input, f);
      if (model?.startsWith("ollama:")) return callOllama(model.slice("ollama:".length), task, input, f);
      if (model?.startsWith("gemini:")) return callGemini(model.slice("gemini:".length), task, input, f);
      if (TRANSLATION_TASKS.has(task)) return mockAdapter.complete(task, input);
      return callGemini(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, task, input, f);
    },
  };
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
      // Real models do not always keep the exact shape: accept a bare list or the list under another key.
      const r = await call<unknown>("draft_follow_ups", input, ids);
      const obj = r as Record<string, unknown> | null;
      const list = Array.isArray(r) ? r : (obj?.items ?? Object.values(obj ?? {}).find(Array.isArray) ?? []);
      return (list as Partial<FollowUpDraft>[])
        .filter((d) => d && typeof d.text === "string")
        .map((d) => ({ text: d.text!, fromSection: typeof d.fromSection === "string" ? d.fromSection : "Note" }));
    },
  };
}
