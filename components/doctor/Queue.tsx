"use client";

import { useEffect, useState } from "react";
import type { VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel } from "@/lib/ui";
import { hardcodedSummary } from "@/lib/agents/doctor/board";
import { langLabel } from "./types";

export function summaryText(v: VisitCard) {
  // TODO(ai): the Stage 0 stub writes summary at triage; until it is present we show the hardcoded line.
  return v.summary?.summary ?? hardcodedSummary("[reason from intake]");
}

export function PatientChips({ v, now, longWaitMinutes }: { v: VisitCard; now: string; longWaitMinutes: number }) {
  const waitedMin = (Date.parse(now) - Date.parse(v.stageChangedAt)) / 60_000;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Mono className="text-[18px]">{v.displayId}</Mono>
      <Chip variant={v.priority === 1 ? "urgent" : "routine"}>Priority {v.priority ?? "?"}</Chip>
      <span className="rounded-full bg-routine-fill px-2 py-0.5 text-xs font-semibold">{v.name ?? v.initials}</span>
      <span className="rounded-full bg-routine-fill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{langLabel(v.language)}</span>
      {v.interpreterNeeded && <Chip variant="urgent">Interpreter needed</Chip>}
      <span className="text-[13px] text-muted">Waiting {sinceLabel(v.stageChangedAt, now)}</span>
      {waitedMin >= longWaitMinutes && <Chip variant="longWait" />}
      <Chip variant={v.urgentEnquiry ? "urgent" : "enquiry"}>
        {v.urgentEnquiry ? "Urgent enquiry open" : v.openEnquiries ? "Enquiry open" : "No open enquiry"}
      </Chip>
    </div>
  );
}

interface Profile {
  reason: { original: string; english: string; language: string };
  triageNote: string | null;
}

export function ProfilePanel({ v, doctorId, onConsult, busy }: { v: VisitCard; doctorId: string; onConsult: () => void; busy: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let live = true;
    setProfile(null);
    fetch(`/api/visits/${v.id}/profile?doctor=${encodeURIComponent(doctorId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setProfile(j.profile ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [v.id, doctorId]);
  const translated = profile && profile.reason.language !== "en";
  return (
    <aside aria-label="Patient profile" className="glass-strong appear flex flex-col gap-4 rounded-[20px] p-5 lg:sticky lg:top-28 lg:self-start">
      <h2 className="text-[17px] font-semibold">Patient overview</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Mono className="text-[22px]">{v.displayId}</Mono>
        <Chip variant="routine">Priority {v.priority ?? "?"}</Chip>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold">{v.name ?? v.initials}</span>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{langLabel(v.language)}</span>
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-muted">Reason for visit, in the patient’s words</h3>
        <div className="mt-1 text-[15px]">“{profile?.reason.original ?? "…"}”</div>
        {translated && (
          <div className="mt-1 text-[13px] text-muted">
            Translated from {langLabel(profile.reason.language)}: “{profile.reason.english}”
          </div>
        )}
      </div>
      <div className="rounded-[14px] border border-border bg-white p-3.5 text-ink">
        <div className="text-[13px] font-semibold text-accent-ink">AI summary · from the triage note and enquiries · you decide</div>
        <div className="mt-1 text-[14px]">{summaryText(v)}</div>
        {!!v.summary?.keyPoints.length && (
          <ul className="mt-1 list-disc pl-5 text-[13px]">
            {v.summary.keyPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-muted">Triage record · entered by the nurse</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {["BP", "Pulse", "Temperature", "Oxygen level"].map((k) => (
            <div key={k} className="rounded-[14px] bg-white/85 p-2.5 shadow-[0_1px_2px_rgb(20_30_45/0.05)]">
              <div className="text-xs text-muted">{k}</div>
              <div className="text-[14px] font-semibold">[from triage]</div>
            </div>
          ))}
        </div>
        {profile?.triageNote && <div className="mt-2 text-[13px]">Triage note: {profile.triageNote}</div>}
      </div>
      <Button variant="primary" className="min-h-12 text-[15px]" onClick={onConsult} disabled={busy}>
        Consult now · bring to see now
      </Button>
    </aside>
  );
}

export function QueueRow(props: {
  v: VisitCard;
  now: string;
  longWaitMinutes: number;
  selected: boolean;
  onView: () => void;
  onConsult: () => void;
  busy: boolean;
}) {
  const { v, selected } = props;
  return (
    <article
      data-testid={`queue-row-${v.displayId}`}
      className={`liftable flex flex-col gap-2.5 rounded-[16px] border bg-surface p-4 shadow-[0_1px_2px_rgb(20_30_45/0.05),0_3px_10px_rgb(20_30_45/0.04)] ${selected ? "border-accent ring-[3px] ring-accent/20" : "border-border"}`}
    >
      <PatientChips v={v} now={props.now} longWaitMinutes={props.longWaitMinutes} />
      <div className="text-[14px]">
        <span className="font-semibold text-muted">AI summary · </span>
        {summaryText(v)}
      </div>
      <div className="flex gap-2">
        <Button onClick={props.onView}>View profile</Button>
        <Button variant="primary" onClick={props.onConsult} disabled={props.busy}>
          Consult now
        </Button>
      </div>
    </article>
  );
}
