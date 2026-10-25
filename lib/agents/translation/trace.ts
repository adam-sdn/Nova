import type { MessageStatus } from "@/lib/contracts";

export interface TraceStep {
  name: "translate" | "backTranslate" | "ruleCheck" | "aiVerify" | "decision";
  attempt: number;
  model: string | null;
  durationMs: number;
  passed: boolean;
  /** Error kinds and severities only: no patient text in the trace. */
  errors: Array<{ kind: string; severity: string }>;
}

export interface Trace {
  messageId: string;
  attempt: number;
  steps: TraceStep[];
  finalState: MessageStatus;
  timestamp: string;
}

export function buildTrace(i: { messageId: string; attempt: number; steps: TraceStep[]; finalState: MessageStatus; now: Date }): Trace {
  return { messageId: i.messageId, attempt: i.attempt, steps: i.steps, finalState: i.finalState, timestamp: i.now.toISOString() };
}

/** Times one step and records it. */
export async function timed<T>(
  steps: TraceStep[],
  name: TraceStep["name"],
  attempt: number,
  model: string | null,
  fn: () => Promise<T> | T,
  verdict: (r: T) => { passed: boolean; errors?: Array<{ kind: string; severity: string }> } = () => ({ passed: true }),
): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  const v = verdict(r);
  steps.push({
    name,
    attempt,
    model,
    durationMs: Math.round(performance.now() - t0),
    passed: v.passed,
    errors: (v.errors ?? []).map((e) => ({ kind: e.kind, severity: e.severity })),
  });
  return r;
}
