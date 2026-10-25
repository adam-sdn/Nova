"use client";

import { useEffect, useRef, useState } from "react";
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
    <section aria-label="Session" className="surface appear flex flex-col gap-4 rounded-[22px] p-5">
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
            className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${st.done ? "border-accent-border bg-accent-tint text-accent-ink" : "border-high-border bg-high-fill text-high-ink"}`}
          >
            {st.label} · {st.done ? "done" : st.label === "In session" ? "not started" : "waiting"}
          </li>
        ))}
      </ol>
      <div className="rounded-[16px] bg-ground p-3.5">
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
  onCompleted: (next: "tests" | "decision", followUps: number) => void;
}) {
  const { v, s, me, messages, act } = props;
  const [line, setLine] = useState("");
  const [asPatient, setAsPatient] = useState(false);
  const [sections, setSections] = useState<Record<string, string>>(() => Object.fromEntries(props.noteSections.map((k) => [k, ""])));
  const [signed, setSigned] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [newTest, setNewTest] = useState("");
  const [error, setError] = useState<string | null>(null);
  // AI fills the Clinical Assessment as the conversation grows. Sections the doctor has typed in are left alone.
  const [aiLines, setAiLines] = useState<Record<string, { fromLine: number; toLine: number }>>({});
  const [drafting, setDrafting] = useState(false);
  const edited = useRef(new Set<string>());
  const transcript = messages.map((m) => (m.direction === "doctor_to_patient" ? m.source : (m.translation ?? m.source)));
  const transcriptKey = transcript.join("\n");

  const fillWithAi = async () => {
    if (transcript.length === 0) return;
    setDrafting(true);
    try {
      const r = (await act(`/api/sessions/${s.id}/draft-note`, { sections: props.noteSections, transcript })) as {
        draft: Record<string, { text: string; fromLine: number; toLine: number }>;
      } | null;
      if (!r) return;
      const open = Object.entries(r.draft).filter(([k, d]) => !edited.current.has(k) && d.text);
      setSections((cur) => ({ ...cur, ...Object.fromEntries(open.map(([k, d]) => [k, d.text])) }));
      setAiLines((cur) => ({ ...cur, ...Object.fromEntries(open.map(([k, d]) => [k, { fromLine: d.fromLine, toLine: d.toLine }])) }));
      setSigned(false);
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    void fillWithAi();
    // Re-draft only when the conversation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptKey]);

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
    const r = await act(`/api/sessions/${s.id}/complete`, {
      next,
      note: { sections, transcript, signed },
      tests: next === "tests" ? tests : [],
    });
    if (r) props.onCompleted(next, (r as { followUps?: unknown[] }).followUps?.length ?? 0);
  };

  const addTest = (t: string) => {
    const n = t.trim();
    if (n && !tests.includes(n)) setTests([...tests, n]);
    setNewTest("");
  };

  return (
    <section aria-label="Session in progress" className="surface appear flex flex-col gap-5 rounded-[22px] p-5">
      <SessionHeader title="Session in progress" v={v} s={s} me={me} capturing />
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Conversation" className="flex flex-col gap-2">
          <h3 className="text-[15px] font-semibold">Conversation</h3>
          {messages.length === 0 && <div className="text-[13px] text-muted">No lines yet.</div>}
          {messages.map((m, i) => (
            <MessageCard key={m.id} m={m} index={i + 1} langLabel={langLabel(v.language)} act={async (p, b) => void (await act(p, b))} />
          ))}
          {/* TODO(speech): live speech capture with typed fallback (Stage 3). Typed input only for now. */}
          <div className="flex flex-col gap-2 rounded-[16px] bg-ground p-2.5">
            <textarea
              aria-label="Type a line"
              className="min-h-16 rounded-[12px] border border-border-strong/50 p-2.5 text-[14px] leading-relaxed"
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
        <section aria-label="Clinical Assessment" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold">Clinical Assessment</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{drafting ? "AI is filling the form…" : "Template: [your trust’s template]"}</span>
              <Button disabled={props.busy || drafting || transcript.length === 0} onClick={fillWithAi}>
                Fill with AI
              </Button>
            </div>
          </div>
          <div className="rounded-[12px] border border-high-border bg-high-fill px-3 py-2 text-xs text-high-ink">
            The AI drafts this form from the conversation. Read every section and correct it before you sign.
          </div>
          {props.noteSections.map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold">{k}</span>
              <textarea
                className="min-h-16 rounded-[12px] border border-border-strong/50 p-2.5 text-[14px] leading-relaxed"
                placeholder="[Doctor to complete]"
                value={sections[k] ?? ""}
                onChange={(e) => {
                  edited.current.add(k);
                  setAiLines(({ [k]: _, ...rest }) => rest);
                  setSections({ ...sections, [k]: e.target.value });
                }}
              />
              {aiLines[k] && (
                <span className="text-xs text-muted" data-testid="ai-draft-label">
                  AI draft · from conversation line{aiLines[k].fromLine === aiLines[k].toLine ? ` ${aiLines[k].fromLine}` : `s ${aiLines[k].fromLine} to ${aiLines[k].toLine}`} · check before signing
                </span>
              )}
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
                  className="pressable min-h-11 rounded-full border border-accent-border bg-accent-tint px-3.5 text-[13px] font-semibold text-accent-ink"
                  onClick={() => setTests(tests.filter((x) => x !== t))}
                >
                  {t} ×
                </button>
              ))}
              {props.testCatalogue ? (
                <select aria-label="Add test" className="min-h-11 rounded-[12px] border border-border-strong/50 px-2.5" value="" onChange={(e) => addTest(e.target.value)}>
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
                    className="min-h-11 rounded-[12px] border border-border-strong/50 px-2.5"
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
            I have reviewed this assessment and sign it ({me.id})
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
