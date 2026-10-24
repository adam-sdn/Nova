import { generateMasterKeyBase64, loadMasterKey } from "@/lib/privacy/crypto";
import { createCtx, type Ctx } from "@/lib/state/db";
import type { AiAdapter } from "@/lib/ai";
import type { Actor } from "@/lib/contracts";

export interface TestCtx extends Ctx {
  /** Move the test clock forward. */
  advance(minutes: number): void;
}

export function testCtx(opts: { adapter?: AiAdapter; start?: string } = {}): TestCtx {
  let t = new Date(opts.start ?? "2026-10-24T09:00:00.000Z").getTime();
  const ctx = createCtx({
    dbPath: ":memory:",
    masterKey: loadMasterKey(generateMasterKeyBase64()),
    now: () => new Date(t),
    adapter: opts.adapter,
  });
  return Object.assign(ctx, { advance: (m: number) => void (t += m * 60_000) });
}

export const nurse: Actor = { role: "nurse", id: "N-01" };
export const nurse2: Actor = { role: "nurse", id: "N-02" };
export const doctor: Actor = { role: "doctor", id: "D-05" };
export const doctor2: Actor = { role: "doctor", id: "D-01" };
export const interpreter: Actor = { role: "interpreter", id: "I-01" };

export const checkinInput = (name = "Test Person One", language = "en") => ({
  name,
  language,
  consentContact: true,
  aiNoticeAccepted: true,
  reason: "Synthetic reason for visit",
});
