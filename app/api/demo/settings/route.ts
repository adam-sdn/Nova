import { z } from "zod";
import { get, post } from "@/lib/api";
import { DemoSettingsReq } from "@/lib/contracts";
import { appConfig } from "@/lib/config";
import { isMockAi, setMockAi } from "@/lib/state/db";
import { audit } from "@/lib/state/audit";

export const dynamic = "force-dynamic";

const view = (mockAi: boolean) => ({ mockAi, demoDefaultsInUse: appConfig.demoDefaultsInUse });

export const GET = get(z.object({}), (ctx) => view(isMockAi(ctx.db)));

/** Toggle MOCK_AI at runtime (stored in the settings table). */
export const POST = post(DemoSettingsReq, async (ctx, b) => {
  setMockAi(ctx.db, b.mockAi);
  audit(ctx, "demo:presenter", "demo.mock_ai", "settings", { mockAi: b.mockAi });
  return view(b.mockAi);
});
