// Public entry point of the translation agent. Registers itself with lib/state/service via setMessageAgent().
import { appConfig } from "@/lib/config";
import { audit } from "@/lib/state/audit";
import type { Ctx } from "@/lib/state/db";
import { recordTranslationResult, setMessageAgent, type MessageAgent } from "@/lib/state/service";
import type { Identifiers } from "@/lib/privacy/crypto";
import { getMessage } from "@/lib/state/repo";
import { messageView } from "@/lib/state/views";
import { runPatientPipeline, runPipeline, type AttemptUpdate, type PipelineDeps } from "./pipeline";

export { runPipeline, runPatientPipeline } from "./pipeline";

/** Each attempt is written with recordTranslationResult (which refuses delivered and escalated). */
function deps(ctx: Ctx, messageId: string, overrides: Partial<PipelineDeps>): PipelineDeps {
  return {
    ai: ctx.ai(),
    config: appConfig.translation,
    ...overrides,
    onAttempt: (u: AttemptUpdate) => {
      recordTranslationResult(ctx, messageId, {
        status: u.state,
        tier: u.tier,
        translation: u.translation,
        backTranslation: u.backTranslation,
        safety: u.ruleCheckResult,
        aiChecks: u.aiVerifyResult,
        trace: u.trace,
      });
    },
  };
}

/** Doctor-to-patient: drafted -> (flagged)* -> ready_for_doctor | held. */
export async function runTranslationPipeline(
  ctx: Ctx,
  messageId: string,
  source: string,
  sourceLang: string,
  targetLang: string,
  opts: { ids?: Identifiers; deps?: Partial<PipelineDeps> } = {},
) {
  const r = await runPipeline(deps(ctx, messageId, opts.deps ?? {}), { messageId, source, sourceLang, targetLang, ids: opts.ids ?? {}, now: ctx.now });
  // Hash-only audit (no patient text): the agent's decision.
  audit(ctx, "system:translation-agent", "message.agent_decision", messageId, { tier: r.tier, reasons: r.reasons, attempts: r.trace.attempt });
  return r;
}

/** Patient-to-doctor: English only, ends ai_checked or needs_checking. */
export async function runPatientTranslationPipeline(
  ctx: Ctx,
  messageId: string,
  source: string,
  sourceLang: string,
  opts: { ids?: Identifiers; deps?: Partial<PipelineDeps> } = {},
) {
  const r = await runPatientPipeline(deps(ctx, messageId, opts.deps ?? {}), {
    messageId,
    source,
    sourceLang,
    ids: opts.ids ?? {},
    now: ctx.now,
  });
  audit(ctx, "system:translation-agent", "message.agent_decision", messageId, { state: r.state });
  return r;
}

export const translationAgent: MessageAgent = async (ctx, messageId, text, direction, visit) => {
  const ids = { name: visit.name };
  if (direction === "doctor_to_patient") await runTranslationPipeline(ctx, messageId, text, "en", visit.language, { ids });
  else await runPatientTranslationPipeline(ctx, messageId, text, visit.language, { ids });
  return { message: messageView(ctx, getMessage(ctx.db, messageId)!) };
};

let registered = false;
export function registerTranslationAgent() {
  if (registered) return;
  setMessageAgent(translationAgent);
  registered = true;
}
