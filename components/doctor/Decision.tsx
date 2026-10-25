"use client";

import { useState } from "react";
import type { PackView, VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono } from "@/lib/ui";
import { langLabel } from "./types";

type Act = (path: string, body?: Record<string, unknown>) => Promise<unknown>;

/** Awaiting Decision: Discharge or Admit (doctor only), then verify and release the results pack. */
export function DecisionPanel({ visits, act, busy }: { visits: VisitCard[]; act: Act; busy: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [results, setResults] = useState("");
  const [advice, setAdvice] = useState("");
  const [packs, setPacks] = useState<Record<string, PackView>>({});

  const run = async (path: string, visitId: string, body?: Record<string, unknown>) => {
    const r = (await act(path, body)) as { pack?: PackView } | null;
    if (r?.pack) setPacks((p) => ({ ...p, [visitId]: r.pack! }));
  };

  const pending = Object.entries(packs).filter(([, p]) => p.status !== "released");
  if (!visits.length && !pending.length) return null;

  return (
    <section aria-label="Awaiting decision" className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4">
      <h2 className="text-[17px] font-semibold">Awaiting decision</h2>
      {visits.map((v) => (
        <article key={v.id} className="rounded-[10px] border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="text-[16px]">{v.displayId}</Mono>
            <span className="text-xs font-semibold">{v.name ?? v.initials}</span>
            <span className="text-xs font-semibold">{langLabel(v.language)}</span>
            {v.tests.map((t) => (
              <Chip key={t.id} variant="routine">
                {t.name}: {t.state.replace("_", " ")}
              </Chip>
            ))}
            <Button className="ml-auto" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
              Record decision
            </Button>
          </div>
          {openId === v.id && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea aria-label="Results" placeholder="Results, as you want the patient to read them" className="min-h-14 rounded-[8px] border border-border p-2" value={results} onChange={(e) => setResults(e.target.value)} />
              <textarea aria-label="Advice" placeholder="Advice" className="min-h-14 rounded-[8px] border border-border p-2" value={advice} onChange={(e) => setAdvice(e.target.value)} />
              <div className="flex gap-2">
                {(["discharge", "admit"] as const).map((o) => (
                  <Button
                    key={o}
                    variant="primary"
                    disabled={busy}
                    onClick={() => run(`/api/visits/${v.id}/decision`, v.id, { outcome: o, results, advice, medicines: [] }).then(() => setOpenId(null))}
                  >
                    {o === "discharge" ? "Discharge" : "Admit"}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </article>
      ))}
      {pending.map(([visitId, p]) => (
        <article key={visitId} className="rounded-[10px] border border-accent-border bg-accent-tint p-3 text-accent-ink">
          <div className="text-[14px] font-semibold">Results pack · {p.status}</div>
          <div className="text-[13px]">{p.content.results || "[no results entered]"}</div>
          <div className="mt-2 flex gap-2">
            <Button disabled={busy || p.status !== "draft"} onClick={() => run(`/api/visits/${visitId}/pack/verify`, visitId)}>
              Verify pack
            </Button>
            <Button variant="primary" disabled={busy || p.status !== "verified"} onClick={() => run(`/api/visits/${visitId}/pack/release`, visitId)}>
              Release pack
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
