"use client";

import { useEffect, useState } from "react";
import type { FollowUpView, StaffState } from "@/lib/contracts";
import { Button, DemoTag, LoopMark, Mono, postJson, usePoll } from "@/lib/ui";
import { COMPLETE_TARGET, readyQueue } from "@/lib/agents/doctor/board";
import { DecisionPanel } from "./Decision";
import { FollowUps } from "./FollowUps";
import { Settings, TEXT_SIZES, type TextSize } from "./Settings";
import { ProfilePanel, QueueRow } from "./Queue";
import { InSession, WaitingFrame } from "./Session";
import { actorOf, type DoctorInfo } from "./types";

type Tab = "home" | "follow-ups" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "follow-ups", label: "Follow-ups" },
  { id: "settings", label: "Settings" },
];
const TEXT_KEY = "careloop.doctor.textSize";

export function DoctorBoard(props: {
  me: DoctorInfo;
  doctors: DoctorInfo[];
  noteSections: string[];
  testCatalogue: string[] | null;
  longWaitMinutes: number;
  /** The session code this doctor joined with. */
  code: string;
  /** Back to the join screen, with the reason to show there. */
  onLeave: (reason?: string) => void;
}) {
  const { me, code, onLeave } = props;
  const [showNames, setShowNames] = useState(false);
  const ended = "The session has ended. Ask the nurse in charge for the new code to join again.";
  const c = encodeURIComponent(code);
  const liveUrl = `/api/live?role=doctor&id=${me.id}&code=${c}`;
  const { data, error, refresh, live } = usePoll<StaffState>(
    `/api/state?role=doctor&id=${me.id}&code=${c}${showNames ? "&names=1" : ""}`,
    2000,
    { url: liveUrl, onEnded: () => onLeave(ended) },
  );
  const followUps = usePoll<{ followUps: FollowUpView[] }>(`/api/follow-ups?doctor=${me.id}&code=${c}`, 2000, { url: liveUrl });
  const [tab, setTab] = useState<Tab>("home");
  const [textSize, setTextSize] = useState<TextSize>("standard");
  useEffect(() => {
    try {
      const t = localStorage.getItem(TEXT_KEY) as TextSize | null;
      if (t && TEXT_SIZES.some((x) => x.id === t)) setTextSize(t);
    } catch {}
  }, []);
  const chooseTextSize = (t: TextSize) => {
    setTextSize(t);
    try {
      localStorage.setItem(TEXT_KEY, t);
    } catch {}
  };
  // A wrong or expired code (for example the session ended while this window was closed).
  useEffect(() => {
    if (error && /session code/i.test(error)) onLeave(ended);
  }, [error, onLeave, ended]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setActionError(null);
    try {
      const r = await postJson(path, { actor: actorOf(me), ...body });
      await Promise.all([refresh(), followUps.refresh()]);
      return r;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const visits = data?.visits ?? [];
  const mine = visits.find((v) => v.activeSession && v.activeSession.doctorId === me.id && v.activeSession.state !== "ended");
  const queue = readyQueue(visits);
  const sel = queue.find((v) => v.id === selected) ?? queue[0] ?? null;
  const now = data?.now ?? new Date().toISOString();

  const consult = async (id: string) => {
    const r = await act(`/api/visits/${id}/consult-now`);
    if (r) setNotice(null);
  };

  const toConfirm = (followUps.data?.followUps ?? []).filter((f) => f.status === "suggested").length;
  const zoom = TEXT_SIZES.find((t) => t.id === textSize)!.zoom;

  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4" style={{ zoom }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[10px] bg-accent text-white" aria-hidden="true">
            <LoopMark />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold">Care Loop · Doctor</h1>
            <div className="text-[13px] text-muted">Emergency department · {me.cubicle}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show names
          </label>
          <DemoTag />
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold">
            {me.name} · <Mono>{me.id}</Mono>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted" data-testid="live-status">
            <span aria-hidden="true" className={`size-2 rounded-full ${live ? "bg-accent" : "bg-border-strong"}`} />
            {live ? "Live" : "Connecting…"}
          </span>
          <Button onClick={() => onLeave()}>Leave session</Button>
        </div>
      </header>

      <nav aria-label="Doctor" className="flex gap-1 border-b border-border" data-testid="doctor-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-[14px] font-semibold ${tab === t.id ? "border-accent text-accent-ink" : "border-transparent text-muted"}`}
          >
            {t.label}
            {t.id === "follow-ups" && toConfirm > 0 && (
              <span className="rounded-full bg-accent px-2 text-[12px] text-white" aria-label={`${toConfirm} to confirm`}>
                {toConfirm}
              </span>
            )}
            {t.id === "home" && mine?.activeSession?.state === "in_session" && tab !== "home" && (
              <span className="text-[12px] font-normal">· in session</span>
            )}
          </button>
        ))}
      </nav>

      {(error || actionError) && (
        <div role="alert" className="rounded-[10px] border border-urgent-border bg-urgent-fill p-3 text-[14px] text-urgent-ink">
          {actionError ?? error}
        </div>
      )}
      {tab === "follow-ups" && (
        <FollowUps items={followUps.data?.followUps ?? []} now={now} act={act} busy={busy} />
      )}
      {tab === "settings" && <Settings me={me} code={code} textSize={textSize} onTextSize={chooseTextSize} onLeave={() => onLeave()} />}

      {/* Home stays mounted while another tab is open, so an assessment in progress is not lost. */}
      <div hidden={tab !== "home"} className="flex flex-col gap-4">
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-[10px] border border-accent-border bg-accent-tint p-3 text-[14px] text-accent-ink">
          <span>{notice}</span>
          <Button onClick={() => setNotice(null)}>Dismiss</Button>
        </div>
      )}

      {mine?.activeSession && (mine.activeSession.state === "waiting" || mine.activeSession.state === "ready") && (
        <WaitingFrame key={mine.activeSession.id} v={mine} s={mine.activeSession} me={me} act={act} busy={busy} />
      )}
      {mine?.activeSession?.state === "in_session" && (
        <InSession
          key={mine.activeSession.id}
          v={mine}
          s={mine.activeSession}
          me={me}
          messages={(data?.messages ?? []).filter((m) => m.sessionId === mine.activeSession!.id)}
          noteSections={props.noteSections}
          testCatalogue={props.testCatalogue}
          act={act}
          busy={busy}
          onCompleted={(next, drafted) =>
            setNotice(
              `Session ${mine.activeSession!.number} ended for ${mine.displayId}. The card moved to ${COMPLETE_TARGET[next]} on the nurse board.` +
                (drafted ? ` ${drafted} follow-up${drafted === 1 ? "" : "s"} drafted for you to confirm in Follow-ups.` : ""),
            )
          }
        />
      )}

      {!mine && (
        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <section aria-label="Ready to be consulted" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-[20px] font-semibold">Ready to be consulted</h2>
              <span className="rounded-full bg-column px-2 text-[13px] font-semibold">{queue.length}</span>
              <span className="text-[13px] text-muted">Triaged patients waiting for a doctor · sorted by priority, then longest wait</span>
            </div>
            {data && queue.length === 0 && <div className="text-[14px] text-muted">No patients are ready to be consulted right now.</div>}
            {queue.map((v) => (
              <QueueRow
                key={v.id}
                v={v}
                now={now}
                longWaitMinutes={props.longWaitMinutes}
                selected={sel?.id === v.id}
                busy={busy}
                onView={() => setSelected(v.id)}
                onConsult={() => consult(v.id)}
              />
            ))}
          </section>
          {sel && <ProfilePanel v={sel} doctorId={me.id} busy={busy} onConsult={() => consult(sel.id)} />}
        </div>
      )}

      {!mine && <DecisionPanel visits={visits.filter((v) => v.status === "awaiting_decision")} act={act} busy={busy} />}
      </div>
    </main>
  );
}
