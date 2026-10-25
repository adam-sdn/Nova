"use client";

import { useState } from "react";
import { Button, Panel, postJson } from "@/lib/ui";
import type { CheckinResult } from "@/lib/contracts";
import { checkinFormErrors, LANGUAGES, type CheckinForm as Form } from "./logic";

const field = "min-h-11 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-[1em] text-ink";

export function CheckinForm({
  sessionCode,
  onDone,
  onBadCode,
}: {
  sessionCode: string;
  onDone: (r: CheckinResult, language: string) => void;
  /** The session ended or the code was wrong: go back to code entry. */
  onBadCode: (message: string) => void;
}) {
  const [f, setF] = useState<Form>({ name: "", language: "en", reason: "", consentContact: false, aiNoticeAccepted: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = checkinFormErrors(f);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const r = await postJson<CheckinResult>("/api/checkin", { ...f, sessionCode });
      onDone(r, f.language);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Check-in failed";
      if (/session code/i.test(msg)) onBadCode(msg);
      else setErrors([msg]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="checkin-form" noValidate>
        <h1 className="text-[1.4em] font-semibold">Check in</h1>
        <p className="rounded-[8px] border border-accent-border bg-accent-tint p-3 text-accent-ink" data-testid="ai-notice">
          You are talking to an automated assistant, not a person. Staff read what you write and make every decision
          about your care.
        </p>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Language</span>
          <select className={field} value={f.language} onChange={(e) => set("language", e.target.value)} name="language">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Your name</span>
          <input className={field} value={f.name} onChange={(e) => set("name", e.target.value)} name="name" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Why did you come today?</span>
          <span className="text-muted">You can write in any language.</span>
          <textarea
            className={`${field} min-h-24 py-2`}
            value={f.reason}
            onChange={(e) => set("reason", e.target.value)}
            name="reason"
          />
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={f.consentContact}
            onChange={(e) => set("consentContact", e.target.checked)}
            name="consentContact"
          />
          <span>I agree that staff may contact me through this app during my visit.</span>
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5"
            checked={f.aiNoticeAccepted}
            onChange={(e) => set("aiNoticeAccepted", e.target.checked)}
            name="aiNoticeAccepted"
          />
          <span>I understand I am talking to an automated assistant.</span>
        </label>
        {errors.length > 0 && (
          <ul role="alert" className="rounded-[8px] border border-urgent-border bg-urgent-fill p-3 text-urgent-ink" data-testid="checkin-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Button type="submit" variant="primary" disabled={busy} style={{ fontSize: "inherit" }}>
          {busy ? "Checking in…" : "Check in"}
        </Button>
      </form>
    </Panel>
  );
}
