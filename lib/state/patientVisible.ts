// CLAUDE.md hard rule 2: the ONE function that decides what a patient may see.
// Only human-verified or released content, plus pre-approved phrases that carry a verifier and date.
// Pure: no database, no decryption. Callers pass already-built views in.
import {
  ENQUIRY_OPEN_STATUSES,
  type MessageStatus,
  type MessageView,
  type PackContent,
  type PackView,
  type PatientMessage,
  type PatientPhrase,
  type VisitStatus,
} from "@/lib/contracts";
import type { PhraseTable } from "@/lib/config";

/** Doctor lines in these states may be shown. Everything else is withheld. */
export const PATIENT_VISIBLE_MESSAGE_STATUSES: readonly MessageStatus[] = [
  "delivered_labelled", // routine tier, shown with a "machine translated" label
  "verified",
  "edited",
  "delivered",
];

/** Doctor lines still on their way (the patient sees "Your interpreter is checking this"). */
const PENDING_STATUSES: readonly MessageStatus[] = ["drafted", "checked", "awaiting_verifier"];

export interface PatientVisibleInput {
  status: VisitStatus;
  language: string;
  messages: MessageView[];
  pack: PackView | null;
  phrases: PhraseTable;
}

export interface PatientVisibleContent {
  messages: PatientMessage[];
  pendingCount: number;
  pack: { content: PackContent; language: string } | null;
  packPreparing: boolean;
  phrases: PatientPhrase[];
  enquiriesOpen: boolean;
}

export function getPatientVisibleContent(input: PatientVisibleInput): PatientVisibleContent {
  const messages: PatientMessage[] = [];
  let pendingCount = 0;

  for (const m of input.messages) {
    if (m.direction === "patient_to_doctor") {
      // The patient's own words, as they wrote them. No AI text is involved.
      messages.push({ id: m.id, direction: m.direction, text: m.source, machineTranslated: false });
      continue;
    }
    if (PATIENT_VISIBLE_MESSAGE_STATUSES.includes(m.status) && m.translation) {
      messages.push({
        id: m.id,
        direction: m.direction,
        text: m.translation,
        machineTranslated: m.status === "delivered_labelled",
      });
    } else if (PENDING_STATUSES.includes(m.status)) {
      pendingCount++;
    }
  }

  const released = input.pack?.status === "released" ? input.pack : null;

  const phrases: PatientPhrase[] = [];
  for (const [key, byLang] of Object.entries(input.phrases)) {
    const p = byLang[input.language];
    if (p && p.text && p.verifiedBy && p.verifiedAt) phrases.push({ key, text: p.text });
  }

  return {
    messages,
    pendingCount,
    pack: released ? { content: released.content, language: released.language } : null,
    packPreparing: input.status === "done" && !released,
    phrases,
    enquiriesOpen: ENQUIRY_OPEN_STATUSES.includes(input.status),
  };
}
