import { appConfig } from "@/lib/config";
import { DoctorGate } from "@/components/doctor/DoctorGate";

export const dynamic = "force-dynamic";

export default async function DoctorPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const { doctor } = await searchParams;
  const doctors = appConfig.doctors;
  return (
    <DoctorGate
      preselect={doctor ?? null}
      doctors={doctors}
      noteSections={appConfig.noteTemplateSections}
      testCatalogue={appConfig.testCatalogue}
      longWaitMinutes={appConfig.longWaitMinutes}
    />
  );
}
