// Shared contract for every route and screen. Only the Stage 0 session changes this file.
// Parallel sessions import types from here; they never redefine them.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const VISIT_STATUSES = [
  "arrival",
  "triage_waiting",
  "triaged",
  "diagnostics",
  "consultation",
  "awaiting_decision",
  "done",
] as const;
export const VisitStatus = z.enum(VISIT_STATUSES);
export type VisitStatus = z.infer<typeof VisitStatus>;

/** Column labels, in board order (SPEC section 4). */
export const COLUMN_LABELS: Record<VisitStatus, string> = {
  arrival: "To Do (Arrival)",
  triage_waiting: "Triage Waiting",
  triaged: "Triaged (Awaiting Doctor)",
  diagnostics: "Diagnostics In Progress",
  consultation: "Doctor Consultation",
  awaiting_decision: "Awaiting Decision",
  done: "Done (Discharged/Admitted)",
};

/** States in which the patient's enquiry box is open (SPEC section 5, last paragraph). */
export const ENQUIRY_OPEN_STATUSES: readonly VisitStatus[] = [
  "triage_waiting",
  "triaged",
  "diagnostics",
  "awaiting_decision",
];

export const SessionState = z.enum(["waiting", "ready", "in_session", "ended"]);
export type SessionState = z.infer<typeof SessionState>;

/** Why a session ended. `not_found` and `returned` never count as a consultation. */
export const SessionEndReason = z.enum(["completed", "not_found", "returned"]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

/**
 * Doctor-to-patient: drafted -> checked -> ready_for_doctor | flagged | held; the doctor's Send gives delivered;
 * Escalate gives escalated (still held). Patient-to-doctor lines end as ai_checked or needs_checking (no gate).
 * Only `delivered` ever reaches the patient (getPatientVisibleContent).
 */
export const MESSAGE_STATUSES = [
  "drafted",
  "checked",
  "ready_for_doctor",
  "flagged",
  "held",
  "escalated",
  "delivered",
  "ai_checked",
  "needs_checking",
] as const;
export const MessageStatus = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof MessageStatus>;

/** The translation agent's decision for a doctor line (SPEC section 9). */
export const MessageTier = z.enum(["routine", "verify", "held"]);
export type MessageTier = z.infer<typeof MessageTier>;

export const MessageDirection = z.enum(["doctor_to_patient", "patient_to_doctor"]);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const TestState = z.enum(["ordered", "in_progress", "done", "results_back"]);
export type TestState = z.infer<typeof TestState>;

export const PACK_STATUSES = ["draft", "verified", "released"] as const;
export const PackStatus = z.enum(PACK_STATUSES);
export type PackStatus = z.infer<typeof PackStatus>;

export const EnquiryTier = z.enum(["urgent", "high", "routine", "needs_review"]);
export type EnquiryTier = z.infer<typeof EnquiryTier>;

export const EnquiryStatus = z.enum(["open", "handled"]);
export type EnquiryStatus = z.infer<typeof EnquiryStatus>;

export const EnquiryKind = z.enum(["message", "feel_worse"]);
export type EnquiryKind = z.infer<typeof EnquiryKind>;

export const Decision = z.enum(["discharge", "admit"]);
export type Decision = z.infer<typeof Decision>;

export const AttestationKind = z.enum(["handled_with_interpreter_service", "consent_via_interpreter_service"]);
export type AttestationKind = z.infer<typeof AttestationKind>;

// ---------------------------------------------------------------------------
// Actors (demo only: no real authentication, the window says who it is)
// ---------------------------------------------------------------------------

export const Role = z.enum(["patient", "nurse", "doctor", "system", "demo"]);
export type Role = z.infer<typeof Role>;

export const Actor = z.object({
  role: Role,
  id: z.string().min(1).max(40),
});
export type Actor = z.infer<typeof Actor>;

const withActor = <T extends z.ZodRawShape>(shape: T) => z.object({ actor: Actor, ...shape });

// ---------------------------------------------------------------------------
// Request bodies (one per route; see docs/CONTRACT.md)
// ---------------------------------------------------------------------------

export const CheckinReq = z.object({
  name: z.string().trim().min(1).max(120),
  language: z.string().trim().min(2).max(12),
  consentContact: z.boolean(),
  aiNoticeAccepted: z.boolean(),
  reason: z.string().trim().min(1).max(2000),
});
export type CheckinReq = z.infer<typeof CheckinReq>;

export const ActorOnlyReq = withActor({});
export type ActorOnlyReq = z.infer<typeof ActorOnlyReq>;

export const TriageReq = withActor({
  priority: z.number().int(),
  note: z.string().max(4000).default(""),
});
export type TriageReq = z.infer<typeof TriageReq>;

export const EscortedReq = withActor({
  outcome: z.enum(["with_doctor", "not_found"]),
});
export type EscortedReq = z.infer<typeof EscortedReq>;

export const StartSessionReq = withActor({
  transcriptionConsent: z.boolean(),
});
export type StartSessionReq = z.infer<typeof StartSessionReq>;

export const NoteBody = z.object({
  sections: z.record(z.string(), z.string()),
  transcript: z.array(z.string()).default([]),
  signed: z.boolean(),
});
export type NoteBody = z.infer<typeof NoteBody>;

export const CompleteSessionReq = withActor({
  next: z.enum(["tests", "decision"]),
  note: NoteBody,
  tests: z.array(z.string().trim().min(1)).default([]),
});
export type CompleteSessionReq = z.infer<typeof CompleteSessionReq>;

export const ReturnToQueueReq = ActorOnlyReq;

export const TestUpdateReq = withActor({ state: TestState });
export type TestUpdateReq = z.infer<typeof TestUpdateReq>;

export const ReopenReq = withActor({
  kind: z.enum(["more_tests", "second_look"]),
  tests: z.array(z.string().trim().min(1)).default([]),
});
export type ReopenReq = z.infer<typeof ReopenReq>;

export const DecisionReq = withActor({
  outcome: Decision,
  results: z.string().max(4000).default(""),
  advice: z.string().max(4000).default(""),
  medicines: z.array(z.string().trim().min(1)).default([]),
});
export type DecisionReq = z.infer<typeof DecisionReq>;

export const EnquiryReq = withActor({
  visitId: z.string().min(1),
  kind: EnquiryKind.default("message"),
  text: z.string().trim().max(2000).default(""),
});
export type EnquiryReq = z.infer<typeof EnquiryReq>;

export const EnquiryPriorityReq = withActor({ tier: EnquiryTier });
export type EnquiryPriorityReq = z.infer<typeof EnquiryPriorityReq>;

export const MessageReq = withActor({
  direction: MessageDirection,
  text: z.string().trim().min(1).max(2000),
});
export type MessageReq = z.infer<typeof MessageReq>;

/** The doctor's Send, after reading "The patient will read: <back-translation>". ready_for_doctor -> delivered only. */
export const SendMessageReq = ActorOnlyReq;
export type SendMessageReq = ActorOnlyReq;

/** Edit and recheck: the doctor's new English text runs through the translation agent again. */
export const RecheckMessageReq = withActor({ text: z.string().trim().min(1).max(2000) });
export type RecheckMessageReq = z.infer<typeof RecheckMessageReq>;

/** Escalate to the hospital interpreter service: the message stays held and the nurse card gets "Interpreter needed". */
export const EscalateMessageReq = withActor({ reason: z.string().trim().max(500).default("") });
export type EscalateMessageReq = z.infer<typeof EscalateMessageReq>;

/** "Handled with interpreter service" (or consent taken there): a recorded attestation with a reason. */
export const AttestMessageReq = withActor({ kind: AttestationKind, reason: z.string().trim().min(1).max(1000) });
export type AttestMessageReq = z.infer<typeof AttestMessageReq>;

export const DemoSettingsReq = z.object({ mockAi: z.boolean() });
export type DemoSettingsReq = z.infer<typeof DemoSettingsReq>;

export const StateQuery = z.object({
  role: z.enum(["nurse", "doctor", "patient"]),
  /** Patient: the visit token from check-in. Staff: their own ID (optional). */
  id: z.string().optional(),
  /** Staff boards: "1" when the Show names toggle is on. */
  names: z.enum(["0", "1"]).optional(),
});
export type StateQuery = z.infer<typeof StateQuery>;

// ---------------------------------------------------------------------------
// Views returned by the API (plain TypeScript; built on the server)
// ---------------------------------------------------------------------------

export interface TestView {
  id: string;
  name: string;
  state: TestState;
}

export interface SessionView {
  id: string;
  visitId: string;
  doctorId: string;
  doctorName: string;
  cubicle: string;
  number: number;
  state: SessionState;
  endReason: SessionEndReason | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface MessageView {
  id: string;
  sessionId: string;
  direction: MessageDirection;
  source: string;
  translation: string | null;
  backTranslation: string | null;
  /** null for patient-to-doctor lines and before the agent has decided. */
  tier: MessageTier | null;
  status: MessageStatus;
  /** Rule checker result (lib/agents/translation/steps/ruleCheck). */
  safety: unknown;
  /** AI verifier result. */
  aiChecks: unknown;
  /** Agent trace: steps, models, retries, results. Shown collapsible on the doctor screen. */
  trace: unknown;
  confirmedBy: string | null;
  confirmedAt: string | null;
  escalatedAt: string | null;
  attestation: { kind: AttestationKind; doctorId: string; createdAt: string } | null;
  createdAt: string;
}

export interface EnquiryView {
  id: string;
  visitId: string;
  displayId: string;
  kind: EnquiryKind;
  text: string;
  originalLang: string;
  category: string | null;
  tier: EnquiryTier;
  aiReason: string | null;
  status: EnquiryStatus;
  handledBy: string | null;
  createdAt: string;
}

export interface PackContent {
  results: string;
  advice: string;
  medicines: string[];
  whenToSeekHelp: string;
}

export interface PackView {
  id: string;
  visitId: string;
  language: string;
  status: PackStatus;
  content: PackContent;
  releasedBy: string | null;
}

/** One card on the staff boards. `name` is null unless Show names is on. */
export interface VisitCard {
  id: string;
  displayId: string;
  initials: string;
  name: string | null;
  language: string;
  status: VisitStatus;
  priority: number | null;
  stageChangedAt: string;
  createdAt: string;
  beingTriagedBy: string | null;
  escortFlag: boolean;
  decision: Decision | null;
  tests: TestView[];
  activeSession: SessionView | null;
  sessionCount: number;
  openEnquiries: number;
  urgentEnquiry: boolean;
  /** A message was escalated and not yet attested: a nurse arranges the hospital interpreter service. */
  interpreterNeeded: boolean;
  /** AI summary from triage. Label it "AI summary" on screen. */
  summary: { summary: string; keyPoints: string[] } | null;
}

export interface StaffState {
  role: "nurse" | "doctor";
  now: string;
  visits: VisitCard[];
  enquiries: EnquiryView[];
  messages: MessageView[];
  doctors: { id: string; name: string; cubicle: string }[];
  mockAi: boolean;
  demoDefaultsInUse: string[];
}

/** What a patient window may see. Built only by getPatientVisibleContent(). */
export interface PatientMessage {
  id: string;
  direction: MessageDirection;
  text: string;
}

export interface PatientPhrase {
  key: string;
  text: string;
}

export interface PatientState {
  role: "patient";
  now: string;
  visit: {
    displayId: string;
    language: string;
    status: VisitStatus;
    enquiriesOpen: boolean;
    escortRequested: boolean;
    inSession: boolean;
    calledForTriage: boolean;
  };
  messages: PatientMessage[];
  /** Doctor lines not yet delivered (the patient sees "Your message is being checked."). */
  pendingCount: number;
  pack: { content: PackContent; language: string } | null;
  packPreparing: boolean;
  phrases: PatientPhrase[];
}

export interface CheckinResult {
  visitId: string;
  displayId: string;
  token: string;
}

export interface ApiError {
  error: { code: string; message: string; issues?: unknown };
}
