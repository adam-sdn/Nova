"use client";

import { useEffect, useState } from "react";
import type { ShiftStatus } from "@/lib/contracts";
import { DemoTag, LoopMark, Mono, postJson, usePoll } from "@/lib/ui";
import { NURSE } from "./NurseBoard";
import { QrCode } from "./QrCode";

/**
 * The poster at the ward entrance: patients scan it on arrival instead of walking to the nurses' station.
 * Opened by the nurse board, so fetching the code is a reveal on that nurse's behalf (audited).
 */
export function EntranceDisplay() {
  // Plain polling: the entrance screen is not a person, so it should not show as connected.
  const shift = usePoll<ShiftStatus>("/api/shift", 2000);
  const open = shift.data?.open === true;
  const openedAt = shift.data?.openedAt ?? null;
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return setCode(null);
    let live = true;
    postJson<{ code: string }>("/api/shift/reveal", { actor: NURSE })
      .then((r) => live && setCode(r.code))
      .catch(() => live && setCode(null));
    return () => {
      live = false;
    };
  }, [open, openedAt]);

  const link = code ? `${window.location.origin}/patient?s=${code}` : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ground p-6 text-center text-ink" data-testid="entrance">
      <div className="flex items-center gap-3">
        <LoopMark />
        <h1 className="m-0 text-xl font-semibold">Emergency department check-in</h1>
      </div>
      {link && code ? (
        <>
          <p className="m-0 text-[15px] text-muted">Scan with your phone camera to check in. You can choose your language.</p>
          <QrCode text={link} className="size-[300px]" testId="entrance-qr" />
          <div className="text-[14px] text-muted">
            Or open <Mono>/patient</Mono> and type <Mono className="text-[18px] tracking-[0.2em] text-ink">{code}</Mono>
          </div>
        </>
      ) : (
        <p className="m-0 text-[15px] text-muted">{shift.data ? "Check-in is closed. Please ask at the desk." : "Loading…"}</p>
      )}
      <DemoTag />
    </main>
  );
}
