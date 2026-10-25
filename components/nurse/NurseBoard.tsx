"use client";

import { useState } from "react";
import { COLUMN_LABELS, VISIT_STATUSES, type StaffState } from "@/lib/contracts";
import { Button, DemoTag, LoopMark, postJson, usePoll } from "@/lib/ui";
import { COLUMN_HINTS, escortRequests, sortCards } from "./boardLogic";
import { BoardCard } from "./BoardCard";
import { EnquiriesInbox } from "./EnquiriesInbox";
import { EscortStrip } from "./EscortStrip";

export const NURSE = { role: "nurse", id: "N-01" } as const;

export interface BoardProps {
  longWaitMinutes: number;
  priorityScale: { min: number; max: number };
}

export function NurseBoard({ longWaitMinutes, priorityScale }: BoardProps) {
  const [showNames, setShowNames] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, refresh } = usePoll<StaffState>(`/api/state?role=nurse&id=${NURSE.id}${showNames ? "&names=1" : ""}`, 2000);

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

  return (
    <div className="min-h-screen bg-ground px-6 pb-8 pt-5 text-ink">
      <main className="mx-auto max-w-[1760px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LoopMark />
            <div>
              <h1 className="m-0 text-lg font-semibold leading-tight">Care Loop · Nurse board</h1>
              <div className="text-[13px] text-muted">Emergency department · {visits.length} patients</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DemoTag />
            <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-routine-ink">
              Nurse {NURSE.id}
            </span>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button aria-pressed={showNames} variant={showNames ? "primary" : "secondary"} onClick={() => setShowNames(!showNames)}>
            {showNames ? "Names shown" : "Show names"}
          </Button>
          <Button onClick={resetDemo}>Reset demo</Button>
          <span className="text-[13px] text-muted">Sorted by priority, then time in stage · patients are tracked by ID</span>
        </div>

        {(error || actionError) && (
          <div role="alert" className="mb-3 rounded-[10px] border border-urgent-border bg-urgent-fill px-3 py-2 text-[13px] text-urgent-ink">
            {actionError ?? error}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[999_1_560px] overflow-x-auto">
            {escorts.length > 0 && <EscortStrip cards={escorts} now={data!.now} act={act} />}
            <div className="grid min-w-[1280px] grid-cols-[repeat(6,minmax(176px,1fr))_minmax(150px,0.8fr)] gap-3">
              {VISIT_STATUSES.map((status) => {
                const cards = sortCards(visits.filter((v) => v.status === status));
                return (
                  <section key={status} aria-label={COLUMN_LABELS[status]} className="flex min-w-0 flex-col gap-2.5 rounded-[12px] bg-column p-2.5">
                    <div className="flex items-start justify-between gap-2 px-1 pt-0.5">
                      <h2 className="m-0 text-sm font-semibold leading-snug">{COLUMN_LABELS[status]}</h2>
                      <span className="rounded-full border border-routine-border bg-surface px-2 py-0.5 text-xs font-semibold">{cards.length}</span>
                    </div>
                    <div className="px-1 text-xs text-muted">{COLUMN_HINTS[status]}</div>
                    {cards.map((c) => (
                      <BoardCard
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
          <EnquiriesInbox enquiries={data?.enquiries ?? []} now={data?.now ?? null} act={act} openCard={openCard} />
        </div>
      </main>
    </div>
  );
}
