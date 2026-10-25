// Pure helpers for the patient screens (client-safe, unit tested in tests/patient.test.ts).
import { ENQUIRY_OPEN_STATUSES, type PatientPhrase, type VisitStatus } from "@/lib/contracts";

/** Languages offered at check-in. TODO(i18n): confirm the list with the hospital. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "pl", label: "Polski (Polish)" },
  { code: "ro", label: "Română (Romanian)" },
  { code: "ur", label: "اردو (Urdu)" },
  { code: "pt", label: "Português (Portuguese)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "uk", label: "Українська (Ukrainian)" },
];

/**
 * One English phrase per status column.
 * TODO(i18n): each phrase needs a verified translation in data/phrases.json (key "status.<status>").
 * TODO(clinician): wording to be approved.
 */
export const STATUS_PHRASES_EN: Record<VisitStatus, string> = {
  arrival: "You are checked in. Please take a seat.", // TODO(i18n)
  triage_waiting: "Please wait. A nurse will call you for an assessment.", // TODO(i18n)
  triaged: "Your assessment is done. Please wait to see a doctor.", // TODO(i18n)
  diagnostics: "Your tests are in progress. Please wait for your results.", // TODO(i18n)
  consultation: "You are with the doctor.", // TODO(i18n)
  awaiting_decision: "The doctor is reviewing your results. Please wait.", // TODO(i18n)
  done: "Your visit is finished.", // TODO(i18n)
};

/** A verified phrase from the patient state wins; otherwise the English placeholder. */
export function statusText(status: VisitStatus, phrases: PatientPhrase[]): string {
  return phrases.find((p) => p.key === `status.${status}`)?.text ?? STATUS_PHRASES_EN[status];
}

/** D8: the enquiry box is open in the waiting-area states only. */
export function enquiryBoxOpen(status: VisitStatus): boolean {
  return ENQUIRY_OPEN_STATUSES.includes(status);
}

/** "I feel worse" stays visible whenever the patient is waiting (not in session, not after Done). */
export function feelWorseVisible(status: VisitStatus): boolean {
  return status !== "consultation" && status !== "done";
}

export interface CheckinForm {
  name: string;
  language: string;
  reason: string;
  consentContact: boolean;
  aiNoticeAccepted: boolean;
}

/** B5: check-in cannot complete without consent to contact (the server checks this too). */
export function checkinFormErrors(f: CheckinForm): string[] {
  const e: string[] = [];
  if (!f.name.trim()) e.push("Please enter your name");
  if (!f.language) e.push("Please choose a language");
  if (!f.reason.trim()) e.push("Please tell us why you came today");
  if (!f.consentContact) e.push("Consent to contact is required");
  if (!f.aiNoticeAccepted) e.push("Please confirm you understand you are talking to an automated assistant");
  return e;
}
