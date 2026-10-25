"use client";

import { useState } from "react";
import Link from "next/link";
import { COLUMN_LABELS, VISIT_STATUSES, type StaffState } from "@/lib/contracts";
import { Button, Chip, DemoTag, NovaMark, Mono, Panel, postJson, usePoll } from "@/lib/ui";

export default function DemoControls() {
  const { data, error, refresh } = usePoll<StaffState>("/api/state?role=nurse", 1500);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(label: string, url: string, body: unknown = {}) {
    setBusy(true);
    setNotice(null);
    try {
      await postJson(url, body);
      setNotice(`${label}: done`);
      await refresh();
    } catch (e) {
      setNotice(`${label}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function checkAudit() {
    const r = await fetch("/api/demo/audit", { cache: "no-store" }).then((x) => x.json());
    setNotice(r.ok ? `Audit chain verified (${r.length} entries)` : `Audit chain BROKEN at entry ${r.brokenAt}`);
  }

  const visits = data?.visits ?? [];
  const demoDefaults = data?.demoDefaultsInUse ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <NovaMark />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Nova Systems · Demo controls</h1>
            <Link href="/" className="text-[13px] text-accent underline underline-offset-2">
              Back to role windows
            </Link>
          </div>
        </div>
        <DemoTag />
      </header>

      {demoDefaults.length > 0 && (
        <Panel className="mb-4 border-high-border bg-high-fill" aria-label="Demo defaults in use" data-testid="demo-defaults">
          <p className="flex items-center gap-2 text-sm font-semibold text-high-ink">
            <Chip variant="high">Demo defaults in use</Chip>
            Not clinical values
          </p>
          <p className="mt-1 text-[13px] text-high-ink">
            These settings still say TODO(clinician) in data/config.json, so DEMO-ONLY values from
            data/demo-defaults.json are used: <span className="font-mono">{demoDefaults.join(", ")}</span>
          </p>
        </Panel>
      )}

      <Panel className="mb-4 flex flex-wrap items-center gap-2" aria-label="Controls">
        <Button variant="primary" disabled={busy} onClick={() => run("Seed", "/api/demo/seed")}>
          Reset and Seed
        </Button>
        <Button disabled={busy} onClick={() => run("Reset", "/api/demo/reset")}>
          Reset (empty board)
        </Button>
        <Button disabled={busy} onClick={() => run("Arrival", "/api/demo/arrival")}>
          Simulate a new arrival
        </Button>
        <Button disabled={busy} onClick={() => run("Advance test", "/api/demo/advance-test")}>
          Advance a test state
        </Button>
        <Button
          disabled={busy || !data}
          aria-pressed={data?.mockAi ?? true}
          onClick={() => run("MOCK_AI", "/api/demo/settings", { mockAi: !data?.mockAi })}
        >
          MOCK_AI: {data ? (data.mockAi ? "on" : "off") : "…"}
        </Button>
        <Button disabled={busy} onClick={checkAudit}>
          Check audit chain
        </Button>
      </Panel>

      <p role="status" aria-live="polite" className="mb-4 min-h-5 text-sm text-muted" data-testid="demo-notice">
        {error ? `Error: ${error}` : notice}
      </p>

      <Panel aria-label="Board summary">
        <h2 className="mb-3 text-sm font-semibold">Board ({visits.length} patients, read-only)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VISIT_STATUSES.map((s) => {
            const inCol = visits.filter((v) => v.status === s);
            return (
              <div key={s} className="rounded-btn bg-column p-2.5" data-testid={`col-${s}`}>
                <p className="mb-1 text-xs font-semibold">
                  {COLUMN_LABELS[s]} <span className="text-muted">({inCol.length})</span>
                </p>
                <ul className="flex flex-col gap-1 text-[13px]">
                  {inCol.map((v) => (
                    <li key={v.id}>
                      <Mono>{v.displayId}</Mono> <span className="text-muted">{v.initials} · {v.language}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
    </main>
  );
}
