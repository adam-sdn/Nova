"use client";

import { useEffect, useState } from "react";
import { Button, DemoTag, LoopMark, Panel, postJson } from "@/lib/ui";
import { DoctorBoard } from "./DoctorBoard";
import type { DoctorInfo } from "./types";

// sessionStorage: a reload keeps the doctor in; closing the window means typing the code again.
const KEY = "careloop.doctor.session";

interface Joined {
  doctorId: string;
  code: string;
}

type BoardProps = Omit<Parameters<typeof DoctorBoard>[0], "me" | "code" | "onLeave">;

export function DoctorGate(props: BoardProps & { preselect: string | null }) {
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setJoined(JSON.parse(raw) as Joined);
    } catch {}
    setReady(true);
  }, []);

  function save(j: Joined | null) {
    setJoined(j);
    try {
      if (j) sessionStorage.setItem(KEY, JSON.stringify(j));
      else sessionStorage.removeItem(KEY);
    } catch {}
  }

  if (!ready) return null;
  const me = joined && props.doctors.find((d) => d.id === joined.doctorId);
  if (joined && me) {
    return (
      <DoctorBoard
        {...props}
        me={me}
        code={joined.code}
        onLeave={(reason) => {
          setNotice(reason ?? null);
          save(null);
        }}
      />
    );
  }
  return (
    <JoinForm
      doctors={props.doctors}
      preselect={props.preselect}
      notice={notice}
      onJoined={(j) => {
        setNotice(null);
        save(j);
      }}
    />
  );
}

function JoinForm({
  doctors,
  preselect,
  notice,
  onJoined,
}: {
  doctors: DoctorInfo[];
  preselect: string | null;
  notice: string | null;
  onJoined: (j: Joined) => void;
}) {
  const [doctorId, setDoctorId] = useState(doctors.find((d) => d.id === preselect)?.id ?? doctors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await postJson("/api/shift/join", { code });
      onJoined({ doctorId, code: code.trim().toUpperCase() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  const field = "min-h-11 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-ink";
  return (
    <main className="grid min-h-screen place-items-center bg-ground p-4 text-ink">
      <Panel className="w-full max-w-[420px]">
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="doctor-join">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <LoopMark />
              <h1 className="m-0 text-lg font-semibold">Join the session</h1>
            </div>
            <DemoTag />
          </div>
          <p className="text-[14px] text-muted">Ask the nurse in charge for the session code shown on the nurse board.</p>
          {notice && (
            <div role="status" className="rounded-[8px] border border-high-border bg-high-fill p-3 text-[14px] text-high-ink">
              {notice}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">Doctor</span>
            <select className={field} value={doctorId} onChange={(e) => setDoctorId(e.target.value)} name="doctor">
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.id} · {d.cubicle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-semibold">Session code</span>
            <input
              className={`${field} font-mono text-[20px] uppercase tracking-[0.2em]`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
            />
          </label>
          {error && (
            <div role="alert" className="text-[14px] font-semibold text-urgent-ink">
              {error}
            </div>
          )}
          <Button variant="primary" type="submit" disabled={busy || code.trim().length < 4}>
            Join session
          </Button>
        </form>
      </Panel>
    </main>
  );
}
