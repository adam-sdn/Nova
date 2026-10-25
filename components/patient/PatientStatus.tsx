"use client";

import { useState } from "react";
import { ArrowIcon, Button, CheckIcon, ClockIcon, Mono, Panel, postJson, TriangleIcon, usePoll } from "@/lib/ui";
import type { PatientState } from "@/lib/contracts";
import { enquiryBoxOpen, feelWorseVisible, LANGUAGES, statusText } from "./logic";

const inherit = { fontSize: "inherit" } as const;

export interface PatientSession {
  token: string;
  visitId: string;
}

/** Everything a checked-in patient sees. All content comes from GET /api/state?role=patient. */
export function PatientStatus({
  session,
  large,
  onToggleLarge,
  onLeave,
}: {
  session: PatientSession;
  large: boolean;
  onToggleLarge: () => void;
  onLeave: () => void;
}) {
  const { data, error, refresh } = usePoll<PatientState>(
    `/api/state?role=patient&id=${encodeURIComponent(session.token)}`,
    2000,
    { url: `/api/live?role=patient&token=${encodeURIComponent(session.token)}` },
  );
  // TODO(i18n): display language only switches UI chrome; there is no API yet to change the visit language.
  const [displayLang, setDisplayLang] = useState<string | null>(null);

  if (!data) {
    return (
      <Panel>
        <p>{error ? `Cannot load your visit: ${error}` : "Loading…"}</p>
        {error && (
          <Button className="mt-3" onClick={onLeave} style={inherit}>
            Check in again
          </Button>
        )}
      </Panel>
    );
  }

  const v = data.visit;
  const actor = { role: "patient" as const, id: session.token };

  return (
    <div className="flex flex-col gap-3">
      <header className="glass sticky top-2 z-10 flex flex-col gap-2 rounded-[20px] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[1.25em]" data-testid="patient-id">
            Your ID: <Mono>{v.displayId}</Mono>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 max-w-full items-center gap-2">
            <span className="text-muted">Language</span>
            <select
              className="min-h-11 min-w-0 max-w-full flex-1 rounded-[12px] border border-border-strong/60 bg-surface px-2.5 text-[1em]"
              value={displayLang ?? v.language}
              onChange={(e) => setDisplayLang(e.target.value)}
              data-testid="language-switch"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={onToggleLarge} aria-pressed={large} style={inherit} data-testid="large-text">
            {large ? "Normal text" : "Large text"}
          </Button>
        </div>
      </header>

      {v.ended && (
        <Panel data-testid="visit-ended" className="border-accent-border bg-accent-tint text-accent-ink">
          <p className="flex items-center gap-2 text-[1.2em] font-semibold">
            <CheckIcon size={18} /> Your visit has ended
          </p>
          <p className="mt-1">Thank you. You can keep this page open to read your summary below.</p>
        </Panel>
      )}

      {!v.ended && v.escortRequested && <EscortAlert key={v.status} />}

      {!v.ended && (
      <Panel aria-live="polite" data-testid="status-feed">
        <h2 className="mb-1 font-semibold text-muted">Your status</h2>
        <p className="flex items-start gap-2 text-[1.15em]">
          <ClockIcon size={18} />
          <span data-testid="status-text">{statusText(v.status, data.phrases)}</span>
        </p>
        {v.calledForTriage && <p className="mt-2 font-semibold">A nurse is getting ready to see you.</p>}
      </Panel>
      )}

      {!v.ended && feelWorseVisible(v.status) && (
        <FeelWorse visitId={session.visitId} actor={actor} onSent={refresh} />
      )}

      {(v.inSession || data.messages.length > 0 || data.pendingCount > 0) && (
        <Messages messages={data.messages} pendingCount={data.pendingCount} />
      )}

      {v.ended ? null : enquiryBoxOpen(v.status) ? (
        <EnquiryBox visitId={session.visitId} actor={actor} />
      ) : (
        v.status !== "done" && (
          <Panel data-testid="enquiry-closed">
            <p className="text-muted">Questions are closed while you are with the doctor. Please ask the doctor directly.</p>
          </Panel>
        )
      )}

      {data.packPreparing && (
        <Panel data-testid="pack-preparing">
          <p>We are preparing your summary. Please wait.</p>
        </Panel>
      )}
      {data.pack && <ResultsPack pack={data.pack} />}

      <p className="text-center text-muted">
        <button type="button" className="min-h-11 underline" onClick={onLeave}>
          Not you? Check in again
        </button>
      </p>
    </div>
  );
}

function EscortAlert() {
  const [here, setHere] = useState(false);
  return (
    <section
      role="alert"
      className="appear rounded-[20px] border border-accent-border bg-accent-tint p-4 text-accent-ink shadow-[0_4px_16px_rgb(8_127_140/0.12)]"
      data-testid="escort-alert"
    >
      <p className="flex items-center gap-2 text-[1.2em] font-semibold">
        <ArrowIcon size={18} /> A nurse is coming
      </p>
      <p className="mt-1">Please stay where you are. The nurse will take you to the doctor.</p>
      {here ? (
        <p className="mt-2 flex items-center gap-2 font-semibold" data-testid="i-am-here-done">
          <CheckIcon size={16} /> Thank you. The nurse is on the way.
        </p>
      ) : (
        // TODO(api): no patient endpoint records "I am here" yet; the nurse confirms with "Patient is with the doctor".
        <Button variant="primary" className="mt-2 w-full" onClick={() => setHere(true)} style={inherit}>
          I am here
        </Button>
      )}
    </section>
  );
}

function FeelWorse({
  visitId,
  actor,
  onSent,
}: {
  visitId: string;
  actor: { role: "patient"; id: string };
  onSent: () => void;
}) {
  const [wording, setWording] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function press() {
    setBusy(true);
    setErr(null);
    try {
      // The server sets tier urgent for feel_worse and returns the fixed clinician wording.
      const r = await postJson<{ urgentText: string }>("/api/enquiries", { actor, visitId, kind: "feel_worse", text: "" });
      setWording(r.urgentText);
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send. Please tell a member of staff.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="feel-worse">
      <Button variant="danger" className="w-full text-[1.15em]" onClick={press} disabled={busy} style={inherit}>
        <TriangleIcon size={18} /> I feel worse
      </Button>
      {wording && (
        <div
          role="alert"
          className="appear mt-2 rounded-[20px] border border-urgent-border bg-urgent-fill p-4 text-urgent-ink"
          data-testid="urgent-wording"
        >
          <p className="flex items-center gap-2 font-semibold">
            <TriangleIcon size={16} /> A nurse has been told.
          </p>
          <p className="mt-1">{wording}</p>
        </div>
      )}
      {err && <p className="mt-2 text-urgent-ink">{err}</p>}
    </section>
  );
}

function EnquiryBox({ visitId, actor }: { visitId: string; actor: { role: "patient"; id: string } }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await postJson("/api/enquiries", { actor, visitId, kind: "message", text });
      setText("");
      setSent(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel data-testid="enquiry-box">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Ask the nurses a question</span>
          <textarea
            className="min-h-20 rounded-[14px] border border-border-strong/60 bg-surface p-3 text-[1em] leading-relaxed"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSent(false);
            }}
            name="enquiry"
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !text.trim()} style={inherit}>
          Send question
        </Button>
        {sent && (
          <p className="flex items-center gap-2" data-testid="enquiry-sent">
            <CheckIcon size={16} /> Sent. A nurse will read it.
          </p>
        )}
        {err && <p className="text-urgent-ink">{err}</p>}
      </form>
    </Panel>
  );
}

function Messages({ messages, pendingCount }: { messages: PatientState["messages"]; pendingCount: number }) {
  return (
    <Panel data-testid="session-messages">
      <h2 className="mb-2 font-semibold text-muted">Messages from your doctor</h2>
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              m.direction === "doctor_to_patient"
                ? "appear mr-6 rounded-[18px] rounded-bl-[6px] bg-ground p-3"
                : "appear ml-8 rounded-[18px] rounded-br-[6px] border border-accent-border bg-accent-tint p-3 text-accent-ink"
            }
          >
            <span className="block text-[0.85em] font-semibold text-muted">
              {m.direction === "doctor_to_patient" ? "Doctor" : "You"}
            </span>
            {m.text}
          </li>
        ))}
      </ul>
      {pendingCount > 0 && (
        <p className="mt-2 flex items-center gap-2 text-muted" data-testid="message-pending">
          <ClockIcon size={16} /> Your message is being checked.
        </p>
      )}
      {messages.length === 0 && pendingCount === 0 && <p className="text-muted">No messages yet.</p>}
    </Panel>
  );
}

function ResultsPack({ pack }: { pack: NonNullable<PatientState["pack"]> }) {
  const [followUp, setFollowUp] = useState(false);
  const c = pack.content;
  return (
    <Panel data-testid="results-pack">
      <h2 className="mb-2 text-[1.2em] font-semibold">Your visit summary</h2>
      <h3 className="font-semibold">Results</h3>
      <p className="mb-2 whitespace-pre-wrap">{c.results || "None"}</p>
      <h3 className="font-semibold">Advice</h3>
      <p className="mb-2 whitespace-pre-wrap">{c.advice || "None"}</p>
      <h3 className="font-semibold">Medicines</h3>
      {c.medicines.length ? (
        <ul className="mb-2 list-disc pl-5">
          {c.medicines.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : (
        <p className="mb-2">None</p>
      )}
      <div className="mb-3 rounded-[16px] border border-urgent-border bg-urgent-fill p-3.5 text-urgent-ink">
        <p className="flex items-center gap-2 font-semibold">
          <TriangleIcon size={16} /> When to get help
        </p>
        <p>{c.whenToSeekHelp}</p>
      </div>
      <Button variant="primary" className="w-full" onClick={() => setFollowUp(true)} style={inherit} data-testid="follow-up">
        Follow-up
      </Button>
      {/* TODO(clinician): follow-up booking route and wording; TODO(api): no follow-up endpoint yet. */}
      {followUp && <p className="mt-2">TODO(clinician): follow-up instructions.</p>}
    </Panel>
  );
}
