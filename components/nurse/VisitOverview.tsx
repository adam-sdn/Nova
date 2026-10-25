"use client";

import { useState } from "react";
import type { EnquiryView, PackStatus, VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel } from "@/lib/ui";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BOARD_COLUMNS, STEP_LABELS, TEST_STATE_LABELS, statusText } from "./boardLogic";

type Act = (url: string, body?: Record<string, unknown>) => Promise<void>;

const PACK_LABEL: Record<PackStatus, string> = {
  draft: "Being prepared",
  verified: "Checked, not yet released",
  released: "Released to the patient",
};

/** Right-hand panel for one patient: where they are in the journey and what is outstanding. */
export function VisitOverview({
  card: c,
  enquiries,
  now,
  act,
  onClose,
}: {
  card: VisitCard;
  enquiries: EnquiryView[];
  now: string;
  act: Act;
  onClose: () => void;
}) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const here = BOARD_COLUMNS.findIndex((col) => col.statuses.includes(c.status));
  const open = enquiries.filter((e) => e.visitId === c.id && e.status === "open");
  const packReleased = c.packStatus === "released";
  const canEnd = c.status === "done" && (c.packStatus === null || packReleased);
  const row = "flex items-start justify-between gap-3 border-b border-black/[0.06] py-2.5 text-[13px] last:border-b-0";

  return (
    <aside
      aria-label={`Overview ${c.displayId}`}
      data-testid="visit-overview"
      className="surface enter-right flex min-w-0 max-w-[380px] flex-[1_1_340px] flex-col gap-3.5 rounded-panel p-4 lg:sticky lg:top-24"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Mono className="text-[20px]">{c.displayId}</Mono>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span>{c.name ?? c.initials}</span>
            <span className="rounded-ctl bg-black/[0.05] px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.04em] text-graphite">{c.language}</span>
            {c.priority !== null && <span className="rounded-ctl border border-black/[0.14] px-1.5 py-0.5 text-[11.5px] font-medium leading-4">Priority {c.priority}</span>}
          </div>
        </div>
        <Button onClick={onClose} aria-label="Close overview">
          Close
        </Button>
      </div>

      <ol aria-label="Journey" className="flex flex-col gap-1">
        {BOARD_COLUMNS.map((col, i) => {
          const state = i < here ? "done" : i === here ? "current" : "next";
          return (
            <li
              key={col.id}
              aria-current={state === "current" ? "step" : undefined}
              className={`flex items-center gap-2 rounded-btn px-2.5 py-2 text-[13px] ${state === "current" ? "bg-onyx font-medium text-white" : state === "done" ? "text-routine-ink" : "text-muted"}`}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {state === "done" ? "✓" : state === "current" ? "●" : "○"}
              </span>
              <span>{col.label}</span>
              {state === "current" && col.statuses.length > 1 && <span className="ml-auto text-xs">{STEP_LABELS[c.status]}</span>}
              <span className="sr-only">{state === "done" ? "(done)" : state === "current" ? "(current)" : "(not yet)"}</span>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-black/[0.07]">
        <div className={row}>
          <span className="text-muted">Now</span>
          <span className="text-right font-semibold">{statusText(c)}</span>
        </div>
        <div className={row}>
          <span className="text-muted">In this stage</span>
          <span>{sinceLabel(c.stageChangedAt, now)}</span>
        </div>
        <div className={row}>
          <span className="text-muted">In the department</span>
          <span>{sinceLabel(c.createdAt, now)}</span>
        </div>
        {c.activeSession && (
          <div className={row}>
            <span className="text-muted">Doctor</span>
            <span className="text-right">
              {c.activeSession.doctorName} · <Mono>{c.activeSession.doctorId}</Mono> · Session {c.activeSession.number}
            </span>
          </div>
        )}
        {c.sessionCount > 0 && !c.activeSession && (
          <div className={row}>
            <span className="text-muted">Consultations</span>
            <span>{c.sessionCount}</span>
          </div>
        )}
        {c.tests.length > 0 && (
          <div className={row}>
            <span className="text-muted">Tests</span>
            <span className="flex flex-col items-end gap-0.5">
              {c.tests.map((t) => (
                <span key={t.id}>
                  {t.name} · {TEST_STATE_LABELS[t.state]}
                </span>
              ))}
            </span>
          </div>
        )}
        {c.decision && (
          <div className={row}>
            <span className="text-muted">Disposition</span>
            <span className="font-semibold">{c.decision === "admit" ? "Admitted to ward" : "Discharged"}</span>
          </div>
        )}
        {c.packStatus && (
          <div className={row}>
            <span className="text-muted">Patient summary</span>
            <span className="flex items-center gap-1.5">
              {packReleased && <Chip variant="verified">Released</Chip>}
              {!packReleased && PACK_LABEL[c.packStatus]}
            </span>
          </div>
        )}
        <div className={row}>
          <span className="text-muted">Open enquiries</span>
          <span>{open.length === 0 ? "None" : open.length}</span>
        </div>
      </div>

      {c.summary && (
        <div className="border-l-2 border-black/[0.12] pl-2.5 text-[12px] leading-relaxed text-routine-ink">
          <span className="font-semibold">AI summary:</span> {c.summary.summary}
        </div>
      )}

      {c.status === "done" && (
        <div className="flex flex-col gap-2.5 border-t border-black/[0.07] pt-3.5" data-testid="end-visit">
          {canEnd ? (
            <>
              <p className="m-0 text-[13px] text-muted">The patient has their summary. You can end the visit.</p>
              <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
                <DialogTrigger asChild>
                  <Button variant="primary">End visit</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>End the visit for {c.displayId}?</DialogTitle>
                  <DialogDescription>
                    The card leaves the board and the patient&apos;s phone shows that the visit has ended. Their summary stays readable.
                  </DialogDescription>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button>Cancel</Button>
                    </DialogClose>
                    <Button
                      variant="primary"
                      onClick={async () => {
                        await act(`/api/visits/${c.id}/close`);
                        setConfirmEnd(false);
                        onClose();
                      }}
                    >
                      Confirm end visit
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <p className="m-0 text-[13px] text-muted">The visit can be ended once the doctor releases the patient&apos;s summary.</p>
          )}
        </div>
      )}
    </aside>
  );
}
