"use client";

import { useState } from "react";
import { Button, Panel, postJson } from "@/lib/ui";

/** Shown when the patient opened the app without the check-in link (or QR code) that carries the session code. */
export function SessionCodeEntry({ notice, onCode }: { notice: string | null; onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/shift/join", { code });
      onCode(code.trim().toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="patient-code">
        <h1 className="text-[1.4em] font-semibold">Check in</h1>
        <p>Scan the code at reception, or type the check-in code shown by staff.</p>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Check-in code</span>
          <input
            className="min-h-12 w-full rounded-[14px] border border-border-strong/60 bg-surface px-3.5 font-mono text-[1.3em] uppercase tracking-[0.2em] text-ink"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            name="sessionCode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
          />
        </label>
        {error && (
          <p role="alert" className="font-semibold text-urgent-ink">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy || code.trim().length < 4}>
          Continue
        </Button>
      </form>
    </Panel>
  );
}
