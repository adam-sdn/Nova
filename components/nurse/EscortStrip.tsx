"use client";

import type { VisitCard } from "@/lib/contracts";
import { Button, Mono, sinceLabel } from "@/lib/ui";

type Act = (url: string, body?: Record<string, unknown>) => Promise<void>;

export function EscortStrip({ cards, now, act }: { cards: VisitCard[]; now: string; act: Act }) {
  return (
    <section aria-label="Escort requests" className="mb-3 flex flex-col gap-2.5 rounded-[12px] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-sm font-semibold">Escort requests</h2>
        <span className="rounded-full border border-accent-border bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-ink">{cards.length}</span>
      </div>
      {cards.map((c) => {
        const s = c.activeSession!;
        return (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-accent-border bg-accent-tint px-3 py-2.5">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-[15px]">{c.displayId}</Mono>
                <span className="text-sm">{c.name ?? c.initials}</span>
                <span className="rounded-[6px] bg-surface px-1.5 py-px text-xs font-semibold uppercase text-routine-ink">{c.language}</span>
              </div>
              <div className="text-[13px] text-routine-ink">
                Called by {s.doctorName} ({s.doctorId}) · {s.cubicle} · requested {sinceLabel(s.createdAt, now)} ago
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act(`/api/sessions/${s.id}/escorted`, { outcome: "not_found" })}>Can’t find patient</Button>
              <Button variant="primary" onClick={() => act(`/api/sessions/${s.id}/escorted`, { outcome: "with_doctor" })}>
                Patient is with the doctor
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
