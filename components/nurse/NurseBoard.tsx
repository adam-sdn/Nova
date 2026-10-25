"use client";

import { useState } from "react";
import type { ShiftStatus, StaffState } from "@/lib/contracts";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button, DemoTag, Mono, NovaMark, postJson, usePoll } from "@/lib/ui";
import { BOARD_COLUMNS, STEP_LABELS, columnCards, escortRequests } from "./boardLogic";
import { DashboardBackdrop } from "@/components/ui/dashboard-backdrop";
import { BoardCard } from "./BoardCard";
import { BoardStats } from "./BoardStats";
import { EnquiriesInbox } from "./EnquiriesInbox";
import { EscortStrip } from "./EscortStrip";
import { ShiftBar, StartSessionGate } from "./ShiftBar";
import { VisitOverview } from "./VisitOverview";

export const NURSE = { role: "nurse", id: "N-01" } as const;

export interface BoardProps {
  longWaitMinutes: number;
  priorityScale: { min: number; max: number };
}

export function NurseBoard({ longWaitMinutes, priorityScale }: BoardProps) {
  const [showNames, setShowNames] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const shift = usePoll<ShiftStatus>("/api/shift", 2000);
  const open = shift.data?.open === true;
  const liveUrl = open ? `/api/live?role=nurse&id=${NURSE.id}` : null;
  const { data, error, refresh } = usePoll<StaffState>(
    open ? `/api/state?role=nurse&id=${NURSE.id}${showNames ? "&names=1" : ""}` : null,
    2000,
    { url: liveUrl },
  );
  // The session bar refetches on the same live signal (presence changes count as changes).
  const shiftLive = usePoll<ShiftStatus>(open ? "/api/shift?live=1" : null, 2000, { url: liveUrl });
  const shiftStatus = shiftLive.data ?? shift.data;

  /** Run an API call, then refresh at once. Errors show in the banner. */
  async function act(url: string, body: Record<string, unknown> = {}) {
    setActionError(null);
    try {
      await postJson(url, { actor: NURSE, ...body });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
    await refresh();
  }

  async function resetDemo() {
    setActionError(null);
    try {
      await postJson("/api/demo/seed", {});
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reset failed");
    }
    setFocusId(null);
    await refresh();
  }

  function openCard(visitId: string) {
    setFocusId(visitId);
    document.getElementById(`card-${visitId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }

  const visits = data?.visits ?? [];
  const escorts = escortRequests(visits);
  // The overview closes by itself when the card leaves the board (for example after End visit).
  const focused = visits.find((v) => v.id === focusId) ?? null;

  if (!shift.data) return <main className="min-h-screen p-6 text-muted">{shift.error ?? "Loading…"}</main>;
  if (!open) return <StartSessionGate actor={NURSE} onStarted={() => void shift.refresh()} />;

  return (
    <div className="min-h-screen px-4 pb-10 pt-4 text-ink sm:px-6">
      <DashboardBackdrop />
      <main className="mx-auto max-w-[1760px]">
        <header className="glass sticky top-3 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <NovaMark />
            <div>
              <h1 className="m-0 text-[17px] font-semibold leading-tight">Nurse board</h1>
              <div className="text-[13px] text-muted">Nova Systems · Emergency department · {visits.length} patients</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DemoTag />
            <span className="border-l border-black/[0.08] pl-3 text-[12.5px] font-medium text-muted">
              Nurse <Mono className="text-ink">{NURSE.id}</Mono>
            </span>
          </div>
        </header>

        {shiftStatus && <ShiftBar actor={NURSE} status={shiftStatus} onEnded={() => void shift.refresh()} />}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="toolbar" aria-label="Board" className="glass inline-flex items-center gap-1 rounded-panel p-1">
            <Button aria-pressed={showNames} variant={showNames ? "primary" : "ghost"} onClick={() => setShowNames(!showNames)}>
              {showNames ? <EyeOff size={15} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={15} strokeWidth={1.75} aria-hidden="true" />}
              {showNames ? "Names shown" : "Show names"}
            </Button>
            <span aria-hidden="true" className="h-5 w-px bg-black/[0.1]" />
            <Button variant="ghost" onClick={resetDemo}>
              <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
              Reset demo
            </Button>
          </div>
          <span className="text-[13px] text-muted">Sorted by priority, then time in stage · patients are tracked by ID</span>
        </div>

        {data && <BoardStats visits={visits} enquiries={data.enquiries} now={data.now} longWaitMinutes={longWaitMinutes} />}

        {(error || actionError) && (
          <div role="alert" className="appear mb-3 rounded-card border border-urgent-border bg-urgent-fill px-3.5 py-2.5 text-[13px] text-urgent-ink">
            {actionError ?? error}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[999_1_560px] overflow-x-auto">
            {escorts.length > 0 && <EscortStrip cards={escorts} now={data!.now} act={act} />}
            <div className="grid min-w-[960px] grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_minmax(280px,1.6fr)_minmax(180px,0.9fr)] gap-3">
              {BOARD_COLUMNS.map((col) => {
                const cards = columnCards(visits, col);
                const grouped = col.statuses.length > 1;
                return (
                  <section key={col.id} aria-label={col.label} data-column={col.id} className="glass-well flex min-w-0 flex-col gap-2 rounded-panel p-2">
                    <div className="flex flex-col gap-0.5 border-b border-black/[0.06] px-2 pb-2.5 pt-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="m-0 text-[13.5px] font-semibold leading-snug tracking-[-0.01em]">{col.label}</h2>
                        <span className="min-w-6 rounded-ctl bg-onyx px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-white">
                          {cards.length}
                        </span>
                      </div>
                      <div className="text-[12px] text-muted">{col.hint}</div>
                    </div>
                    {cards.map((c) => (
                      <BoardCard
                        stepLabel={grouped ? STEP_LABELS[c.status] : undefined}
                        onOpen={() => setFocusId(c.id)}
                        key={c.id}
                        card={c}
                        now={data!.now}
                        longWaitMinutes={longWaitMinutes}
                        priorityScale={priorityScale}
                        focused={focusId === c.id}
                        act={act}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          </div>
          {focused && data ? (
            <VisitOverview
              key={focused.id}
              card={focused}
              enquiries={data.enquiries}
              now={data.now}
              act={act}
              onClose={() => setFocusId(null)}
            />
          ) : (
            <EnquiriesInbox enquiries={data?.enquiries ?? []} now={data?.now ?? null} act={act} openCard={openCard} />
          )}
        </div>
      </main>
    </div>
  );
}
