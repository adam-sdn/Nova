import { NurseBoard } from "@/components/nurse/NurseBoard";
import { appConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function NursePage() {
  return <NurseBoard longWaitMinutes={appConfig.longWaitMinutes} priorityScale={appConfig.priorityScale} />;
}
