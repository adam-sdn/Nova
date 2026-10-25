"use client";

import { useEffect, useState } from "react";
import { DemoTag, Mono, Panel } from "@/lib/ui";
import { CheckinForm } from "@/components/patient/CheckinForm";
import { PatientStatus, type PatientSession } from "@/components/patient/PatientStatus";

const KEY = "careloop.patient";
const LARGE_KEY = "careloop.patient.large";

function load(): PatientSession | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const token = q.get("token");
    const visitId = q.get("visit");
    if (token && visitId) return { token, visitId };
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PatientSession) : null;
  } catch {
    return null;
  }
}

export default function PatientPage() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<PatientSession | null>(null);
  const [justCheckedIn, setJustCheckedIn] = useState<string | null>(null);
  const [large, setLarge] = useState(false);

  useEffect(() => {
    setSession(load());
    try {
      setLarge(localStorage.getItem(LARGE_KEY) === "1");
    } catch {}
    setReady(true);
  }, []);

  function save(s: PatientSession | null) {
    setSession(s);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {}
  }

  function toggleLarge() {
    setLarge((l) => {
      try {
        localStorage.setItem(LARGE_KEY, l ? "0" : "1");
      } catch {}
      return !l;
    });
  }

  return (
    <main className="min-h-screen bg-ground text-ink">
      <div
        className="mx-auto flex w-full max-w-[420px] flex-col gap-3 px-4 py-4"
        style={{ fontSize: large ? 20 : 16 }}
        data-large={large ? "1" : "0"}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">Care Loop</span>
          <DemoTag />
        </div>
        {justCheckedIn && (
          <Panel role="status" data-testid="checkin-done" className="border-accent-border bg-accent-tint text-accent-ink">
            <p className="text-[1.3em] font-semibold">
              Your ID: <Mono>{justCheckedIn}</Mono>
            </p>
            <p>Show this ID to staff. Keep this page open.</p>
          </Panel>
        )}
        {!ready ? null : session ? (
          <PatientStatus
            session={session}
            large={large}
            onToggleLarge={toggleLarge}
            onLeave={() => {
              setJustCheckedIn(null);
              save(null);
            }}
          />
        ) : (
          <CheckinForm
            onDone={(r) => {
              setJustCheckedIn(r.displayId);
              save({ token: r.token, visitId: r.visitId });
            }}
          />
        )}
      </div>
    </main>
  );
}
