import type { Actor } from "@/lib/contracts";

export interface DoctorInfo {
  id: string;
  name: string;
  cubicle: string;
}

export const actorOf = (me: DoctorInfo): Actor => ({ role: "doctor", id: me.id });

export const langLabel = (code: string) => code.toUpperCase();

/** "es" -> "Spanish", for spoken-language controls. Falls back to the code. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}
