"use client";

import { useEffect, useState } from "react";
import type { PresenceView, ShiftStatus } from "@/lib/contracts";
import { Button, DemoTag, LoopMark, Mono, Panel, postJson } from "@/lib/ui";
import { QrCode, openEntranceWindow } from "./QrCode";

type Actor = { role: "nurse"; id: string };

/** How long a revealed code stays on screen before it hides itself again. */
const REVEAL_MS = 30_000;

/** Shown instead of the board until a nurse starts the shift's session. */
export function StartSessionGate({ actor, onStarted }: { actor: Actor; onStarted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function start() {
    // Open the entrance window inside the click, so the browser does not block it.
    openEntranceWindow();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/shift", { actor });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the session");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-4 text-ink">
      <Panel glass className="appear flex w-full max-w-[460px] flex-col gap-4 rounded-[24px] p-6" data-testid="start-session">
        <div className="flex items-center gap-3">
          <LoopMark />
          <h1 className="m-0 text-lg font-semibold">Start the shift session</h1>
        </div>
        <p className="text-[14px] text-muted">
          Starting a session creates a code. Doctors type it to join the board, and patients scan the check-in QR
          at the entrance, which opens in its own window. The session stays open until a nurse ends it.
        </p>
        {error && (
          <div role="alert" className="text-[14px] font-semibold text-urgent-ink">
            {error}
          </div>
        )}
        <Button variant="primary" disabled={busy} onClick={start}>
          Start session
        </Button>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-muted">Nurse {actor.id}</span>
          <DemoTag />
        </div>
      </Panel>
    </main>
  );
}

function presenceSummary(list: PresenceView[]) {
  const by = (r: PresenceView["role"]) => list.filter((p) => p.role === r);
  return { nurses: by("nurse"), doctors: by("doctor"), patients: by("patient") };
}

/** Session code (tap to reveal), who is connected, and End session. */
export function ShiftBar({ actor, status, onEnded }: { actor: Actor; status: ShiftStatus; onEnded: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => setCode(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [code]);

  async function reveal() {
    setError(null);
    try {
      setCode((await postJson<{ code: string }>("/api/shift/reveal", { actor })).code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reveal the code");
    }
  }

  async function end() {
    setError(null);
    try {
      await postJson("/api/shift/close", { actor });
      setCode(null);
      setConfirmEnd(false);
      onEnded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the session");
    }
  }

  const { nurses, doctors, patients } = presenceSummary(status.connected);
  const patientLink = code && typeof window !== "undefined" ? `${window.location.origin}/patient?s=${code}` : null;

  return (
    <section
      aria-label="Shift session"
      data-testid="shift-bar"
      className="glass mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted">Session code</span>
        {code ? (
          <button
            type="button"
            onClick={() => setCode(null)}
            className="pressable min-h-11 rounded-[12px] border border-accent-border bg-accent-tint px-3.5 text-accent-ink"
            aria-label="Session code, tap to hide"
            data-testid="session-code"
          >
            <Mono className="text-[20px] tracking-[0.2em]">{code}</Mono>
          </button>
        ) : (
          <button
            type="button"
            onClick={reveal}
            className="pressable min-h-11 rounded-[12px] border border-border bg-white/80 px-3.5 text-[14px] font-semibold shadow-[0_1px_2px_rgb(20_30_45/0.05)] hover:bg-white"
            data-testid="reveal-code"
          >
            <span aria-hidden="true" className="mr-2 font-mono tracking-[0.2em]">
              ••••••
            </span>
            Tap to reveal
          </button>
        )}
      </div>
      {patientLink && <QrCode text={patientLink} className="size-[120px]" testId="patient-qr" />}
      {patientLink && (
        <div className="text-[13px]">
          <span className="text-muted">Patient check-in link · </span>
          <Mono className="break-all" data-testid="patient-link">
            {patientLink}
          </Mono>
          <span className="text-muted"> · hides in 30 s</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="connected">
        <span className="font-semibold text-muted">Connected</span>
        {[...nurses, ...doctors].map((p) => (
          <span key={`${p.role}:${p.id}`} className="appear inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-tint px-2.5 py-1 text-accent-ink">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            {p.role === "nurse" ? "Nurse" : "Doctor"} <Mono>{p.id}</Mono>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/60 px-2.5 py-1">
          <span aria-hidden="true" className={`size-2 rounded-full ${patients.length ? "bg-accent" : "bg-border-strong"}`} />
          {patients.length} {patients.length === 1 ? "patient" : "patients"} online
        </span>
        {doctors.length === 0 && <span className="text-muted">No doctor has joined yet</span>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {error && (
          <span role="alert" className="text-[13px] font-semibold text-urgent-ink">
            {error}
          </span>
        )}
        {confirmEnd ? (
          <>
            <span className="text-[13px]">End for everyone? Doctors are logged out and the code stops working.</span>
            <Button variant="primary" onClick={end}>
              Confirm end
            </Button>
            <Button onClick={() => setConfirmEnd(false)}>Keep running</Button>
          </>
        ) : (
          <>
            <Button onClick={openEntranceWindow}>Entrance QR</Button>
            <Button onClick={() => setConfirmEnd(true)}>End session</Button>
          </>
        )}
      </div>
    </section>
  );
}
