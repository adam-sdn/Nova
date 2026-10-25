import type { Actor } from "@/lib/contracts";

export interface DoctorInfo {
  id: string;
  name: string;
  cubicle: string;
}

export const actorOf = (me: DoctorInfo): Actor => ({ role: "doctor", id: me.id });

export const langLabel = (code: string) => code.toUpperCase();
