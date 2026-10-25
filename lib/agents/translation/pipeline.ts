// The translation agent graph (SPEC section 9):
// translate -> backTranslate -> ruleCheck -> aiVerify -> decision, retrying translate up to maxRetries times.
import type { Ai } from "@/lib/ai";
import type { TranslationConfig } from "@/lib/config";
import type { MessageStatus, MessageTier } from "@/lib/contracts";
import { pseudonymise, restore, type Identifiers, type PseudoMap } from "@/lib/privacy/crypto";
import { aiVerify, type AiVerifyResult } from "./steps/aiVerify";
import { backTranslate } from "./steps/backTranslate";
import { decide, preHoldReasons, type DecisionReason } from "./steps/decision";
import { ruleCheck, type RuleCheckResult } from "./steps/ruleCheck";
import { translate } from "./steps/translate";
import { buildTrace, timed, type Trace, type TraceStep } from "./trace";

export interface Privacy {
  pseudonymise: (text: string, ids?: Identifiers) => { text: string; map: PseudoMap };
  restore: (text: string, map: PseudoMap) => string;
}

export interface AttemptUpdate {
  state: MessageStatus;
  attempt: number;
  tier: MessageTier | null;
  translation: string;
  backTranslation: string | null;
  ruleCheckResult: RuleCheckResult;
  aiVerifyResult: AiVerifyResult;
  trace: Trace;
}

export interface PipelineDeps {
  ai: Ai;
  config: TranslationConfig;
  privacy?: Privacy;
  /** Called after each attempt (flagged while retries are left) and once with the final state. */
  onAttempt?: (u: AttemptUpdate) => Promise<void> | void;
}

export interface PipelineInput {
  messageId: string;
  source: string;
  sourceLang: string;
  targetLang: string;
  ids: Identifiers;
  now: () => Date;
}

export interface PipelineResult {
  state: MessageStatus;
  translation: string;
  backTranslation: string | null;
  ruleCheckResult: RuleCheckResult;
  aiVerifyResult: AiVerifyResult;
  tier: MessageTier;
  reasons: DecisionReason[];
  trace: Trace;
}

const defaultPrivacy: Privacy = { pseudonymise, restore };

const feedbackFrom = (rc: RuleCheckResult, av: AiVerifyResult): string[] => [
  ...rc.errors.map((e) => `${e.kind}: preserve "${e.source}" verbatim${e.found ? ` (back-translation had "${e.found}")` : ""}`),
  ...av.errors.map((e) => `${e.kind}: ${e.detail}`),
];

/** Doctor-to-patient. */
export async function runPipeline(deps: PipelineDeps, input: PipelineInput): Promise<PipelineResult> {
  const { ai, config } = deps;
  const privacy = deps.privacy ?? defaultPrivacy;
  // Pseudonymise before any step; the AI only ever sees tokens.
  const pseudo = privacy.pseudonymise(input.source, input.ids);
  const steps: TraceStep[] = [];
  // Consent and weak-language messages are held whatever the checks say, so retries are pointless.
  const maxAttempts = preHoldReasons({ ...input, config }).length ? 1 : config.maxRetries + 1;
  let feedback: string[] = [];

  for (let attempt = 1; ; attempt++) {
    const t = await timed(steps, "translate", attempt, config.translator.model, () =>
      translate(ai, { source: pseudo.text, sourceLang: input.sourceLang, targetLang: input.targetLang, feedback, attempt, model: config.translator.model }),
    );
    const bt = await timed(steps, "backTranslate", attempt, config.backTranslator.model, () =>
      backTranslate(ai, { translation: t.translation, translationLang: input.targetLang, backLang: input.sourceLang, model: config.backTranslator.model }),
    );
    // Restore identifiers after the back-translation (server side, never sent anywhere).
    const translation = privacy.restore(t.translation, pseudo.map);
    const backTranslation = privacy.restore(bt.backTranslation, pseudo.map);
    const rc = await timed(steps, "ruleCheck", attempt, null, () => ruleCheck(input.source, backTranslation), (r) => r);
    const av = await timed(
      steps,
      "aiVerify",
      attempt,
      config.aiVerifier.model,
      () => aiVerify(ai, { source: pseudo.text, translation: t.translation, backTranslation: bt.backTranslation, ruleErrors: rc.errors, model: config.aiVerifier.model }),
      (r) => r,
    );
    const passed = rc.passed && av.passed;
    const last = passed || attempt >= maxAttempts;

    if (!last) {
      const state: MessageStatus = "flagged";
      await deps.onAttempt?.({ state, attempt, tier: null, translation, backTranslation, ruleCheckResult: rc, aiVerifyResult: av, trace: buildTrace({ messageId: input.messageId, attempt, steps: [...steps], finalState: state, now: input.now() }) });
      feedback = feedbackFrom(rc, av);
      continue;
    }

    const d = await timed(steps, "decision", attempt, null, () => decide({ source: input.source, targetLang: input.targetLang, ruleCheck: rc, aiVerify: av, config }), (r) => ({
      passed: r.tier !== "held",
      errors: r.reasons.map((kind) => ({ kind, severity: r.tier === "held" ? "critical" : "info" })),
    }));
    const state: MessageStatus = d.tier === "held" ? "held" : "ready_for_doctor";
    const trace = buildTrace({ messageId: input.messageId, attempt, steps, finalState: state, now: input.now() });
    await deps.onAttempt?.({ state, attempt, tier: d.tier, translation, backTranslation, ruleCheckResult: rc, aiVerifyResult: av, trace });
    return { state, translation, backTranslation, ruleCheckResult: rc, aiVerifyResult: av, tier: d.tier, reasons: d.reasons, trace };
  }
}

export type PatientPipelineResult = Omit<PipelineResult, "tier" | "reasons">;

/** Patient-to-doctor: English only, no retries, no gate. */
export async function runPatientPipeline(
  deps: PipelineDeps,
  input: Omit<PipelineInput, "targetLang">,
): Promise<PatientPipelineResult> {
  const { ai, config } = deps;
  const privacy = deps.privacy ?? defaultPrivacy;
  const pseudo = privacy.pseudonymise(input.source, input.ids);
  const steps: TraceStep[] = [];
  const t = await timed(steps, "translate", 1, config.translator.model, () =>
    translate(ai, { source: pseudo.text, sourceLang: input.sourceLang, targetLang: "en", attempt: 1, model: config.translator.model }),
  );
  const translation = privacy.restore(t.translation, pseudo.map);
  // Numbers, units and drug names are mostly language-neutral; word lists are English, so this is a partial check.
  const rc = await timed(steps, "ruleCheck", 1, null, () => ruleCheck(input.source, translation), (r) => r);
  const av = await timed(
    steps,
    "aiVerify",
    1,
    config.aiVerifier.model,
    () => aiVerify(ai, { source: pseudo.text, translation: t.translation, backTranslation: "", ruleErrors: rc.errors, model: config.aiVerifier.model }),
    (r) => r,
  );
  const state: MessageStatus = rc.passed && av.passed ? "ai_checked" : "needs_checking";
  const trace = buildTrace({ messageId: input.messageId, attempt: 1, steps, finalState: state, now: input.now() });
  await deps.onAttempt?.({ state, attempt: 1, tier: null, translation, backTranslation: null, ruleCheckResult: rc, aiVerifyResult: av, trace });
  return { state, translation, backTranslation: null, ruleCheckResult: rc, aiVerifyResult: av, trace };
}
