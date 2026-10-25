"use client";

import { useState } from "react";
import type { ShiftStatus, StaffState } from "@/lib/contracts";
import { Button, DemoTag, LoopMark, postJson, usePoll } from "@/lib/ui";
import { BOARD_COLUMNS, STEP_LABELS, columnCards, escortRequests } from "./boardLogic";
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
      <main className="mx-auto max-w-[1760px]">
        <header className="glass sticky top-3 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-4 py-3">
          <div className="flex items-center gap-3">
            <LoopMark />
            <div>
              <h1 className="m-0 text-[17px] font-semibold leading-tight">Nurse board</h1>
              <div className="text-[13px] text-muted">Care Loop · Emergency department · {visits.length} patients</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DemoTag />
            <span className="btn-glass rounded-full px-3 py-1.5 text-[13px] font-medium text-routine-ink">
              Nurse {NURSE.id}
            </span>
          </div>
        </header>

        {shiftStatus && <ShiftBar actor={NURSE} status={shiftStatus} onEnded={() => void shift.refresh()} />}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="glass inline-flex items-center gap-1.5 rounded-full p-1.5">
            <Button aria-pressed={showNames} variant={showNames ? "primary" : "secondary"} onClick={() => setShowNames(!showNames)}>
              {showNames ? "Names shown" : "Show names"}
            </Button>
            <Button onClick={resetDemo}>Reset demo</Button>
          </div>
          <span className="text-[13px] text-muted">Sorted by priority, then time in stage · patients are tracked by ID</span>
        </div>

        {data && <BoardStats visits={visits} enquiries={data.enquiries} now={data.now} longWaitMinutes={longWaitMinutes} />}

        {(error || actionError) && (
          <div role="alert" className="appear mb-3 rounded-[14px] border border-urgent-border bg-urgent-fill px-3.5 py-2.5 text-[13px] text-urgent-ink">
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
                  <section key={col.id} aria-label={col.label} data-column={col.id} className="glass-well flex min-w-0 flex-col gap-2.5 rounded-[20px] p-2.5">
                    <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                      <h2 className="m-0 text-[14px] font-semibold leading-snug">{col.label}</h2>
                      <span className="min-w-6 rounded-full bg-white/85 px-2 py-0.5 text-center text-xs font-semibold tabular-nums shadow-[0_1px_2px_rgb(20_30_45/0.06)]">
                        {cards.length}
                      </span>
                    </div>
                    <div className="px-1.5 pb-0.5 text-xs text-muted">{col.hint}</div>
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
