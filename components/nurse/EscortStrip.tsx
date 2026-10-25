"use client";

import type { VisitCard } from "@/lib/contracts";
import { Button, Mono, sinceLabel } from "@/lib/ui";

type Act = (url: string, body?: Record<string, unknown>) => Promise<void>;

export function EscortStrip({ cards, now, act }: { cards: VisitCard[]; now: string; act: Act }) {
  return (
    <section aria-label="Escort requests" className="glass-dark appear mb-3 flex flex-col gap-2.5 rounded-panel px-4 py-3.5">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-sm font-semibold text-white">Escort requests</h2>
        <span className="rounded-ctl bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-onyx">{cards.length}</span>
      </div>
      {cards.map((c) => {
        const s = c.activeSession!;
        return (
          <div key={c.id} data-testid={`escort-${c.displayId}`} className="flex flex-wrap items-center justify-between gap-2.5 rounded-card border border-white/10 bg-white/[0.06] px-3.5 py-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-[15px]">{c.displayId}</Mono>
                <span className="text-sm text-white/90">{c.name ?? c.initials}</span>
                <span className="rounded-ctl bg-white/12 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">{c.language}</span>
              </div>
              <div className="text-[13px] text-white/65">
                Called by {s.doctorName} ({s.doctorId}) · {s.cubicle} · requested {sinceLabel(s.createdAt, now)} ago
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="bg-transparent text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)] hover:bg-white/10" onClick={() => act(`/api/sessions/${s.id}/escorted`, { outcome: "not_found" })}>Can’t find patient</Button>
              <Button variant="primary" className="bg-white text-onyx hover:bg-white/90" onClick={() => act(`/api/sessions/${s.id}/escorted`, { outcome: "with_doctor" })}>
                Patient is with the doctor
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
