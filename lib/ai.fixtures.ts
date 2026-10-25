// MOCK_AI=1 fixtures: deterministic, offline, and obviously labelled as mock output.
// They never invent clinical content: they echo or restructure what they were given.
import type { AiAdapter, AiTask } from "./ai";

type Handler = (input: any) => unknown;

const handlers: Record<AiTask, Handler> = {
  translate_intake: ({ text, language }) => ({
    english: language === "en" ? text : `[mock translation from ${language}] ${text}`,
  }),

  classify_enquiry: ({ text }: { text: string }) => {
    const t = text.toLowerCase();
    const has = (...w: string[]) => w.some((x) => t.includes(x));
    if (has("breath")) return { category: "breathing", confidence: 0.9, reason: "Mentions breathing (mock)" };
    if (has("bleed", "blood")) return { category: "bleeding", confidence: 0.9, reason: "Mentions bleeding (mock)" };
    if (has("dizzy", "faint")) return { category: "dizziness", confidence: 0.85, reason: "Mentions dizziness (mock)" };
    if (has("pain", "hurt")) return { category: "pain", confidence: 0.8, reason: "Mentions pain (mock)" };
    if (has("how long", "wait", "when", "?")) return { category: "question", confidence: 0.8, reason: "A question about the visit (mock)" };
    if (has("water", "cold", "toilet", "blanket")) return { category: "comfort", confidence: 0.8, reason: "A comfort request (mock)" };
    return { category: "other", confidence: 0.4, reason: "Unclear message (mock)" };
  },

  summarise_patient: ({ reason, triageNote, enquiries }: { reason: string; triageNote: string; enquiries: string[] }) => ({
    summary: `Mock summary. Reason: ${reason}${triageNote ? ` Triage note: ${triageNote}` : ""}`,
    keyPoints: [
      `Reason for visit: ${reason}`,
      ...(triageNote ? [`Triage note: ${triageNote}`] : []),
      ...(enquiries.length ? [`${enquiries.length} enquiry(ies) while waiting`] : []),
    ],
  }),

  draft_note: ({ transcript, sections }: { transcript: string[]; sections: string[] }) => {
    const out: Record<string, { text: string; fromLine: number; toLine: number }> = {};
    const n = transcript.length;
    sections.forEach((s, i) => {
      const line = n ? Math.min(i, n - 1) : 0;
      out[s] = n
        ? { text: transcript[line], fromLine: line + 1, toLine: line + 1 }
        : { text: "", fromLine: 0, toLine: 0 };
    });
    return out;
  },

  translate_message: ({ text, from, to }: { text: string; from: string; to: string }) => {
    // Demo only (rehearsal step 7): a line containing "(plant wrong dose)" is mistranslated with the first
    // number doubled, so the rule checker has something real to catch. Remove the marker and recheck to pass.
    const planted = /\(plant wrong dose\)/i.test(text) ? text.replace(/\d+/, (n) => String(Number(n) * 2)) : text;
    return { text: from === to ? planted : `[mock ${to}] ${planted}` };
  },

  back_translate: ({ text }: { text: string }) => ({ text: text.replace(/^\[mock [^\]]+\] /, "") }),

  verify_translation: () => ({ passed: true, errors: [] }),

  draft_pack: ({ results, advice, medicines }) => ({ results, advice, medicines }),
};

export const mockAdapter: AiAdapter = {
  async complete(task, input) {
    return JSON.stringify(handlers[task](JSON.parse(input)));
  },
};
