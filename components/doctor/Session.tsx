"use client";

import { useState } from "react";
import type { MessageView, SessionView, VisitCard } from "@/lib/contracts";
import { Button, Chip, Mono } from "@/lib/ui";
import { canComplete, canStartSession, sessionSteps } from "@/lib/agents/doctor/board";
import { MessageCard } from "./MessageCard";
import { summaryText } from "./Queue";
import { langLabel, type DoctorInfo } from "./types";

type Act = (path: string, body?: Record<string, unknown>) => Promise<unknown>;

export function SessionHeader({ title, v, s, me, capturing }: { title: string; v: VisitCard; s: SessionView; me: DoctorInfo; capturing?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[18px] font-semibold">{title}</h2>
        {capturing && <Chip variant="note" />}
      </div>
      <div className="flex gap-4" data-testid="session-ids">
        {[
          ["Patient ID", v.displayId],
          ["Doctor ID", me.id],
          ["Session no.", String(s.number)],
        ].map(([k, val]) => (
          <div key={k}>
            <div className="text-xs text-muted">{k}</div>
            <Mono className="text-[16px]">{val}</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WaitingFrame({ v, s, me, act, busy }: { v: VisitCard; s: SessionView; me: DoctorInfo; act: Act; busy: boolean }) {
  const [consent, setConsent] = useState(false);
  const arrived = s.state === "ready";
  return (
    <section aria-label="Session" className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-4">
      <SessionHeader title="Session" v={v} s={s} me={me} />
      <div>
        <div className="text-[17px] font-semibold">{arrived ? "Patient is here" : "Waiting for the patient"}</div>
        <div className="text-[14px] text-muted">
          {arrived
            ? `The nurse confirmed the patient is with you in ${me.cubicle}. You can start the session.`
            : `The nurse has been notified and will bring the patient to ${me.cubicle}. You can start once they arrive.`}
        </div>
      </div>
      <ol className="flex flex-wrap gap-2">
        {sessionSteps(s).map((st) => (
          <li
            key={st.label}
            className={`rounded-[8px] border px-2.5 py-1.5 text-[13px] font-semibold ${st.done ? "border-accent-border bg-accent-tint text-accent-ink" : "border-high-border bg-high-fill text-high-ink"}`}
          >
            {st.label} · {st.done ? "done" : st.label === "In session" ? "not started" : "waiting"}
          </li>
        ))}
      </ol>
      <div className="rounded-[10px] border border-border p-3">
        <div className="flex gap-2 text-xs font-semibold">
          <span>{v.name ?? v.initials}</span>
          <span>{langLabel(v.language)}</span>
          {v.interpreterNeeded && <Chip variant="urgent">Interpreter needed</Chip>}
        </div>
        <div className="mt-1 text-[14px]">
          <span className="font-semibold text-muted">AI summary · </span>
          {summaryText(v)}
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-[14px]">
        <input type="checkbox" className="size-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        The patient was informed and agreed to transcription
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={busy || !canStartSession(s, consent)}
          onClick={() => act(`/api/sessions/${s.id}/start`, { transcriptionConsent: consent })}
        >
          Start session
        </Button>
        <Button disabled={busy} onClick={() => act(`/api/sessions/${s.id}/return`)}>
          Return to queue
        </Button>
      </div>
    </section>
  );
}

export function InSession(props: {
  v: VisitCard;
  s: SessionView;
  me: DoctorInfo;
  messages: MessageView[];
  noteSections: string[];
  testCatalogue: string[] | null;
  act: Act;
  busy: boolean;
  onCompleted: (next: "tests" | "decision") => void;
}) {
  const { v, s, me, messages, act } = props;
  const [line, setLine] = useState("");
  const [asPatient, setAsPatient] = useState(false);
  const [sections, setSections] = useState<Record<string, string>>(() => Object.fromEntries(props.noteSections.map((k) => [k, ""])));
  const [signed, setSigned] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [newTest, setNewTest] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendLine = async () => {
    if (!line.trim()) return;
    await act(`/api/sessions/${s.id}/messages`, {
      direction: asPatient ? "patient_to_doctor" : "doctor_to_patient",
      text: line,
    });
    setLine("");
  };

  const complete = async (next: "tests" | "decision") => {
    const ok = canComplete(next, signed, tests.length);
    if (!ok.ok) return setError(ok.reason ?? null);
    setError(null);
    const transcript = messages.map((m) => (m.direction === "doctor_to_patient" ? m.source : (m.translation ?? m.source)));
    const r = await act(`/api/sessions/${s.id}/complete`, {
      next,
      note: { sections, transcript, signed },
      tests: next === "tests" ? tests : [],
    });
    if (r) props.onCompleted(next);
  };

  const addTest = (t: string) => {
    const n = t.trim();
    if (n && !tests.includes(n)) setTests([...tests, n]);
    setNewTest("");
  };

  return (
    <section aria-label="Session in progress" className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface p-4">
      <SessionHeader title="Session in progress" v={v} s={s} me={me} capturing />
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Conversation" className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Conversation</h3>
          {messages.length === 0 && <div className="text-[13px] text-muted">No lines yet.</div>}
          {messages.map((m, i) => (
            <MessageCard key={m.id} m={m} index={i + 1} langLabel={langLabel(v.language)} act={async (p, b) => void (await act(p, b))} />
          ))}
          {/* TODO(speech): live speech capture with typed fallback (Stage 3). Typed input only for now. */}
          <div className="flex flex-col gap-2 rounded-[10px] border border-border p-2">
            <textarea
              aria-label="Type a line"
              className="min-h-16 rounded-[8px] border border-border p-2 text-[14px]"
              placeholder={asPatient ? "Patient line (demo)" : "Type what you want to say to the patient"}
              value={line}
              onChange={(e) => setLine(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={props.busy || !line.trim()} onClick={sendLine}>
                Check translation
              </Button>
              <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" checked={asPatient} onChange={(e) => setAsPatient(e.target.checked)} />
                Demo: this is the patient speaking
              </label>
            </div>
          </div>
        </section>
        <section aria-label="Draft note" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Draft note</h3>
            <span className="text-xs text-muted">Template: [your trust’s template]</span>
          </div>
          {props.noteSections.map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold">{k}</span>
              <textarea
                className="min-h-16 rounded-[8px] border border-border p-2 text-[14px]"
                placeholder="[Doctor to complete]"
                value={sections[k] ?? ""}
                onChange={(e) => setSections({ ...sections, [k]: e.target.value })}
              />
              {/* TODO(ai): AI draft lines, each marked "AI draft · from conversation lines x to y". */}
            </label>
          ))}
          <div>
            <div className="text-[13px] font-semibold">Tests to order</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {tests.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-label={`Remove ${t}`}
                  className="min-h-11 rounded-[8px] border border-accent-border bg-accent-tint px-3 text-[13px] font-semibold text-accent-ink"
                  onClick={() => setTests(tests.filter((x) => x !== t))}
                >
                  {t} ×
                </button>
              ))}
              {props.testCatalogue ? (
                <select aria-label="Add test" className="min-h-11 rounded-[8px] border border-border px-2" value="" onChange={(e) => addTest(e.target.value)}>
                  <option value="">Add test</option>
                  {props.testCatalogue.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <>
                  {/* TODO(clinician): testCatalogue in config; free text until then. */}
                  <input
                    aria-label="Test name"
                    className="min-h-11 rounded-[8px] border border-border px-2"
                    value={newTest}
                    onChange={(e) => setNewTest(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTest(newTest)}
                  />
                  <Button onClick={() => addTest(newTest)}>Add test</Button>
                </>
              )}
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[14px] font-semibold">
            <input type="checkbox" className="size-5" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
            I have reviewed this note and sign it ({me.id})
          </label>
        </section>
      </div>
      {error && (
        <div role="alert" className="text-[14px] font-semibold text-urgent-ink">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={props.busy} onClick={() => complete("tests")}>
          Complete · send for tests
        </Button>
        <Button variant="primary" disabled={props.busy} onClick={() => complete("decision")}>
          Complete · to decision
        </Button>
      </div>
    </section>
  );
}
