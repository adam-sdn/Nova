"use client";

import { useState } from "react";
import type { EnquiryView, PackStatus, VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel } from "@/lib/ui";
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
  const row = "flex items-start justify-between gap-3 border-b border-border/70 py-2.5 text-[13px] last:border-b-0";

  return (
    <aside
      aria-label={`Overview ${c.displayId}`}
      data-testid="visit-overview"
      className="glass appear flex min-w-0 max-w-[380px] flex-[1_1_340px] flex-col gap-3.5 rounded-[22px] p-4 lg:sticky lg:top-24"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Mono className="text-[20px]">{c.displayId}</Mono>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span>{c.name ?? c.initials}</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-routine-ink">{c.language}</span>
            {c.priority !== null && <span className="rounded-full border border-border-strong/50 bg-white px-2 py-0.5 text-xs font-semibold">Priority {c.priority}</span>}
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
              className={`flex items-center gap-2 rounded-[12px] px-2.5 py-2 text-[13px] ${state === "current" ? "border border-accent-border bg-accent-tint font-semibold text-accent-ink shadow-[0_1px_0_rgb(255_255_255/0.7)_inset]" : state === "done" ? "text-routine-ink" : "text-muted"}`}
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

      <div className="rounded-[16px] bg-white/85 px-3 shadow-[0_1px_2px_rgb(20_30_45/0.05)]">
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
        <div className="rounded-[14px] bg-white/70 px-3 py-2 text-xs leading-relaxed text-routine-ink">
          <span className="font-semibold">AI summary:</span> {c.summary.summary}
        </div>
      )}

      {c.status === "done" && (
        <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-white/85 p-3.5" data-testid="end-visit">
          {canEnd ? (
            confirmEnd ? (
              <>
                <p className="m-0 text-[13px]">End this visit? The card leaves the board and the patient&apos;s phone shows that the visit has ended.</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await act(`/api/visits/${c.id}/close`);
                      onClose();
                    }}
                  >
                    Confirm end visit
                  </Button>
                  <Button onClick={() => setConfirmEnd(false)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <p className="m-0 text-[13px] text-muted">The patient has their summary. You can end the visit.</p>
                <Button variant="primary" onClick={() => setConfirmEnd(true)}>
                  End visit
                </Button>
              </>
            )
          ) : (
            <p className="m-0 text-[13px] text-muted">The visit can be ended once the doctor releases the patient&apos;s summary.</p>
          )}
        </div>
      )}
    </aside>
  );
}
