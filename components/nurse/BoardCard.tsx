"use client";

import { useState } from "react";
import { TestState, type VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel } from "@/lib/ui";
import { cardChips, statusText, TEST_STATE_LABELS } from "./boardLogic";

type Act = (url: string, body?: Record<string, unknown>) => Promise<void>;

interface Props {
  card: VisitCard;
  now: string;
  longWaitMinutes: number;
  priorityScale: { min: number; max: number };
  focused: boolean;
  act: Act;
  /** Step within a grouped column, e.g. "Ready for doctor". */
  stepLabel?: string;
}

export function BoardCard({ card: c, now, longWaitMinutes, priorityScale, focused, act, stepLabel }: Props) {
  const [triageOpen, setTriageOpen] = useState(false);
  const [priority, setPriority] = useState("");
  const [note, setNote] = useState("");
  const s = c.activeSession;
  const time = c.status === "done" ? `${sinceLabel(c.stageChangedAt, now)} ago` : `${sinceLabel(c.stageChangedAt, now)} in stage`;
  const p = Number(priority);
  const priorityValid = priority !== "" && Number.isInteger(p) && p >= priorityScale.min && p <= priorityScale.max;
  const allResultsBack = c.tests.length > 0 && c.tests.every((t) => t.state === "results_back");

  async function completeTriage() {
    if (!priorityValid) return;
    await act(`/api/visits/${c.id}/triage`, { priority: p, note });
    setTriageOpen(false);
    setPriority("");
    setNote("");
  }

  return (
    <article
      id={`card-${c.id}`}
      data-testid={`card-${c.displayId}`}
      className={`flex flex-col gap-1.5 rounded-[10px] border bg-surface p-2.5 ${focused ? "border-accent ring-2 ring-accent" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <Mono className="text-[15px]">{c.displayId}</Mono>
        {stepLabel && (
          <span data-testid="step-label" className="rounded-[6px] border border-accent-border bg-accent-tint px-1.5 py-px text-xs font-semibold text-accent-ink">
            {stepLabel}
          </span>
        )}
        {c.priority !== null && (
          <span className="rounded-[6px] border border-border-strong bg-surface px-1.5 py-px text-xs font-semibold">Priority {c.priority}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm">{c.name ?? c.initials}</span>
        <span className="rounded-[6px] bg-column px-1.5 py-px text-xs font-semibold uppercase text-routine-ink">{c.language}</span>
      </div>
      <div className="text-[13px] text-routine-ink">{statusText(c)}</div>

      {s && (c.status === "consultation" || s.state === "waiting") && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] font-semibold">with {s.doctorName}</div>
          <Mono className="text-xs font-medium text-muted">
            {s.doctorId} · Session {s.number}
          </Mono>
        </div>
      )}

      {c.tests.length > 0 && c.status !== "diagnostics" && (
        <div className="flex flex-wrap gap-1">
          {c.tests.map((t) => (
            <span key={t.id} className="rounded-[6px] border border-border bg-ground px-1.5 py-px text-xs text-routine-ink">
              {t.name} · {TEST_STATE_LABELS[t.state]}
            </span>
          ))}
        </div>
      )}

      {c.status === "diagnostics" && c.tests.length > 0 && (
        <div className="flex flex-col gap-1">
          {c.tests.map((t) => (
            <label key={t.id} className="flex flex-wrap items-center justify-between gap-1 rounded-[6px] border border-border bg-ground px-1.5 py-1 text-xs text-routine-ink">
              <span>{t.name}</span>
              <select
                aria-label={`${t.name} state`}
                className="min-h-11 rounded-[6px] border border-border-strong bg-surface px-1 text-xs"
                value={t.state}
                onChange={(e) => act(`/api/visits/${c.id}/tests/${t.id}`, { state: e.target.value })}
              >
                {TestState.options.map((o) => (
                  <option key={o} value={o}>
                    {TEST_STATE_LABELS[o]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{time}</span>
        {cardChips(c, now, longWaitMinutes).map((chip) => (
          <Chip key={chip.label} variant={chip.variant}>
            {chip.label}
          </Chip>
        ))}
      </div>

      {c.summary && (
        <div className="rounded-[8px] bg-ground px-2 py-1.5 text-xs text-routine-ink">
          <span className="font-semibold">AI summary:</span> {c.summary.summary}
        </div>
      )}

      {c.status === "arrival" && <Button onClick={() => act(`/api/visits/${c.id}/register`)}>Register</Button>}

      {c.status === "triage_waiting" && !c.beingTriagedBy && (
        <Button variant="primary" onClick={() => act(`/api/visits/${c.id}/call-triage`)}>
          Call for triage
        </Button>
      )}

      {c.status === "triage_waiting" && c.beingTriagedBy && !triageOpen && (
        <Button variant="primary" onClick={() => setTriageOpen(true)}>
          Complete triage
        </Button>
      )}

      {c.status === "triage_waiting" && c.beingTriagedBy && triageOpen && (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void completeTriage();
          }}
        >
          <label className="flex flex-col gap-0.5 text-xs font-semibold">
            Priority ({priorityScale.min} to {priorityScale.max})
            <input
              type="number"
              required
              min={priorityScale.min}
              max={priorityScale.max}
              step={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="min-h-11 rounded-[8px] border border-border-strong px-2 text-sm font-normal"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs font-semibold">
            Triage note
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-[8px] border border-border-strong px-2 py-1 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Button type="submit" variant="primary" disabled={!priorityValid}>
              Complete triage
            </Button>
            <Button onClick={() => setTriageOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {c.status === "diagnostics" && (
        <Button variant="primary" disabled={!allResultsBack} onClick={() => act(`/api/visits/${c.id}/to-decision`)}>
          Move to Awaiting Decision
        </Button>
      )}
    </article>
  );
}
