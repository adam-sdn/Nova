"use client";

import { useEffect, useState } from "react";
import { House, ListChecks, Settings as SettingsIcon, type LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FollowUpView, StaffState } from "@/lib/contracts";
import { Button, DemoTag, NovaLogo, NovaMark, Mono, postJson, usePoll } from "@/lib/ui";
import { COMPLETE_TARGET, readyQueue } from "@/lib/agents/doctor/board";
import { DecisionPanel } from "./Decision";
import { FollowUps } from "./FollowUps";
import { Settings, TEXT_SIZES, type TextSize } from "./Settings";
import { ProfilePanel, QueueRow } from "./Queue";
import { InSession, WaitingFrame } from "./Session";
import { actorOf, type DoctorInfo } from "./types";

type Tab = "home" | "follow-ups" | "settings";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "follow-ups", label: "Follow-ups", icon: ListChecks },
  { id: "settings", label: "Settings", icon: SettingsIcon },
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
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="block" style={{ zoom }}>
      {/* Floating glass navigation: a compact sidebar on desktop, a pill bar at the bottom on phones. */}
      <aside className="glass fixed inset-x-3 bottom-3 z-30 rounded-[22px] p-1.5 lg:inset-x-auto lg:bottom-4 lg:left-4 lg:top-4 lg:flex lg:w-[200px] lg:flex-col lg:gap-8 lg:p-3">
        <div className="hidden items-center gap-2.5 px-1.5 pt-1.5 lg:flex">
          <NovaLogo height={44} />
        </div>
      <TabsList
        variant="rail"
        aria-label="Doctor"
        data-testid="doctor-nav"
        className="justify-between lg:flex-col lg:justify-start lg:gap-1.5"
      >
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} variant="rail" aria-label={t.label} className="lg:w-full">
            <span className="relative">
              <t.icon size={20} strokeWidth={1.9} aria-hidden="true" />
              {t.id === "follow-ups" && toConfirm > 0 && (
                <span
                  className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] leading-[18px] tabular-nums text-white shadow-[0_0_0_2px_#fff]"
                  aria-label={`${toConfirm} to confirm`}
                >
                  {toConfirm}
                </span>
              )}
              {t.id === "home" && mine?.activeSession?.state === "in_session" && tab !== "home" && (
                <span className="absolute -right-1.5 -top-0.5 size-2.5 rounded-full bg-accent shadow-[0_0_0_2px_#fff]" aria-label="in session" />
              )}
            </span>
            <span className="hidden group-data-[state=active]:inline lg:inline">{t.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      </aside>

    <main className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 pb-28 pt-4 lg:pb-10 lg:pl-[232px]">
      <header className="glass sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="lg:hidden">
            <NovaMark />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold leading-tight">{me.name}</h1>
            <div className="text-[13px] text-muted">
              Nova Systems · <Mono className="font-medium">{me.id}</Mono> · {me.cubicle}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show names
          </label>
          <DemoTag />
          <span className="btn-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-muted" data-testid="live-status">
            <span aria-hidden="true" className={`size-2 rounded-full ${live ? "bg-accent shadow-[0_0_0_3px_rgb(8_127_140/0.18)]" : "bg-border-strong"}`} />
            {live ? "Live" : "Connecting…"}
          </span>
          <Button onClick={() => onLeave()}>Leave session</Button>
        </div>
      </header>

      {(error || actionError) && (
        <div role="alert" className="appear rounded-[14px] border border-urgent-border bg-urgent-fill p-3.5 text-[14px] text-urgent-ink">
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
        <div role="status" className="appear flex items-center justify-between gap-3 rounded-[14px] border border-accent-border bg-accent-tint p-3.5 text-[14px] text-accent-ink">
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
    </Tabs>
  );
}
