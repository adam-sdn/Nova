import { appConfig } from "@/lib/config";
import { DoctorBoard } from "@/components/doctor/DoctorBoard";

export const dynamic = "force-dynamic";

export default async function DoctorPage({ searchParams }: { searchParams: Promise<{ doctor?: string }> }) {
  const { doctor } = await searchParams;
  const doctors = appConfig.doctors;
  const me = doctors.find((d) => d.id === doctor) ?? doctors.find((d) => d.id === "D-05") ?? doctors[0];
  return (
    <DoctorBoard
      me={me}
      doctors={doctors}
      noteSections={appConfig.noteTemplateSections}
      testCatalogue={appConfig.testCatalogue}
      longWaitMinutes={appConfig.longWaitMinutes}
    />
  );
}
