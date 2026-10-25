"use client";

import { useEffect, useState } from "react";
import { DemoTag, Mono, NovaLogo, Panel } from "@/lib/ui";
import { CheckinForm } from "@/components/patient/CheckinForm";
import { PatientStatus, type PatientSession } from "@/components/patient/PatientStatus";
import { SessionCodeEntry } from "@/components/patient/SessionCodeEntry";

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
  // The session code from the check-in link or QR code (?s=CODE), or typed by the patient.
  const [code, setCode] = useState<string | null>(null);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);

  useEffect(() => {
    setSession(load());
    try {
      setCode(new URLSearchParams(window.location.search).get("s"));
    } catch {}
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
    <main className="min-h-screen text-ink">
      <div
        className="mx-auto flex w-full max-w-[440px] flex-col gap-3.5 px-4 pb-8 pt-4"
        style={{ fontSize: large ? 20 : 16 }}
        data-large={large ? "1" : "0"}
      >
        <div className="flex items-center justify-between px-1">
          <NovaLogo height={36} />
          <DemoTag />
        </div>
        {justCheckedIn && (
          <Panel role="status" data-testid="checkin-done" className="appear border-accent-border bg-accent-tint text-accent-ink">
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
        ) : code ? (
          <CheckinForm
            sessionCode={code}
            onDone={(r) => {
              setJustCheckedIn(r.displayId);
              save({ token: r.token, visitId: r.visitId });
            }}
            onBadCode={(msg) => {
              setCodeNotice(msg);
              setCode(null);
            }}
          />
        ) : (
          <SessionCodeEntry
            notice={codeNotice}
            onCode={(c) => {
              setCodeNotice(null);
              setCode(c);
            }}
          />
        )}
      </div>
    </main>
  );
}
