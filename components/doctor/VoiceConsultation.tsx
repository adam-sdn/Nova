"use client";

import { Mic, Pause, Play } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SPEECH_LANGUAGES } from "@/lib/voice/languages";
import { Button } from "@/lib/ui";
import { useHoldToTalk, type Speaker } from "./useHoldToTalk";

type Direction = "doctor_to_patient" | "patient_to_doctor";

const DOCTOR_LANGUAGE = "en";

/**
 * Speech and typed input for the consultation. Each turn is captured only while a button is held,
 * turned into text locally (OpenWhispr), and shown for the doctor to correct before it goes through
 * the normal translation checks. Nothing is sent, translated or filed without the doctor's click.
 */
export function VoiceConsultation(props: {
  sessionId: string;
  doctorId: string;
  patientLanguage: string;
  patientLanguageLabel: string;
  busy: boolean;
  onSend: (direction: Direction, text: string) => Promise<unknown>;
}) {
  const patientSpeech = (SPEECH_LANGUAGES as readonly string[]).includes(props.patientLanguage);
  const talk = useHoldToTalk({
    sessionId: props.sessionId,
    doctorId: props.doctorId,
    languageOf: (s) => (s === "doctor" ? DOCTOR_LANGUAGE : props.patientLanguage),
  });
  const [paused, setPaused] = useState(false);
  const [sending, setSending] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedAsPatient, setTypedAsPatient] = useState(false);
  const { state } = talk;
  const active = state.phase === "starting" || state.phase === "recording" || state.phase === "processing";
  const who = (s: Speaker) => (s === "doctor" ? "Doctor" : "Patient");

  // A ref, not state: two clicks in the same frame would both see sending === false.
  const inFlight = useRef(false);
  const submit = async (direction: Direction, text: string) => {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setSending(true);
    try {
      return await props.onSend(direction, text.trim());
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const sendReviewed = async () => {
    if (state.phase !== "review") return;
    const r = await submit(state.speaker === "doctor" ? "doctor_to_patient" : "patient_to_doctor", state.text);
    if (r) talk.reset();
  };

  const holdHandlers = (speaker: Speaker) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      void talk.start(speaker);
    },
    onPointerUp: () => talk.stop(),
    onPointerCancel: () => talk.stop(),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        void talk.start(speaker);
      }
    },
    onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") talk.stop();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const holdButton = (speaker: Speaker, label: string, disabledReason: string | null) => {
    const live = (state.phase === "recording" || state.phase === "starting") && state.speaker === speaker;
    const disabled = paused || props.busy || sending || !!disabledReason || state.phase === "review" || (active && !live);
    return (
      <button
        type="button"
        data-testid={`hold-${speaker}`}
        aria-pressed={live}
        disabled={disabled}
        title={disabledReason ?? undefined}
        className={`pressable flex min-h-14 flex-1 touch-none select-none items-center justify-center gap-2 rounded-btn border px-3 text-[14px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
          live ? "border-urgent-border bg-urgent-fill text-urgent-ink" : speaker === "doctor" ? "border-transparent bg-onyx text-white" : "border-black/[0.12] bg-white text-ink"
        }`}
        {...holdHandlers(speaker)}
      >
        <Mic size={17} strokeWidth={1.9} aria-hidden="true" className={live ? "animate-pulse" : ""} />
        <span>{live ? `Recording ${who(speaker).toLowerCase()}… release to stop` : `Hold to talk · ${label}`}</span>
      </button>
    );
  };

  const status =
    paused ? "Microphone paused. Typed input still works."
    : state.phase === "starting" ? "Opening the microphone…"
    : state.phase === "recording" ? `Recording the ${who(state.speaker).toLowerCase()}. Release the button to stop.`
    : state.phase === "processing" ? "Turning speech into text on this computer…"
    : state.phase === "review" ? `Check what was heard before sending.`
    : state.phase === "idle" ? (state.notice ?? "Hold a button while that person speaks. Recording stops when you let go.")
    : "";

  return (
    <div className="flex flex-col gap-3 rounded-card bg-black/[0.03] p-3" data-testid="voice-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Speak or type</span>
        <Button
          variant="ghost"
          className="min-h-11 px-3 text-[12.5px]"
          aria-pressed={paused}
          disabled={active}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {paused ? "Resume microphone" : "Pause microphone"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {holdButton("doctor", "Doctor · English", null)}
        {holdButton("patient", `Patient · ${props.patientLanguageLabel}`, patientSpeech ? null : `Speech-to-text is not set up for ${props.patientLanguageLabel}. Type instead.`)}
      </div>

      <div role="status" aria-live="polite" className="min-h-5 text-[12.5px] text-muted" data-testid="voice-status">
        {status}
      </div>

      {state.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-urgent-border bg-urgent-fill px-3 py-2 text-[13px] text-urgent-ink">
          <span>{state.message}</span>
          <span className="flex gap-2">
            {state.canRetry && <Button className="min-h-11" onClick={talk.retry}>Retry</Button>}
            <Button variant="ghost" className="min-h-11" onClick={() => talk.reset()}>Dismiss</Button>
          </span>
        </div>
      )}

      {state.phase === "review" && (
        <div className="appear flex flex-col gap-2 rounded-btn border border-accent-border bg-accent-tint p-3" data-testid="voice-review">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-accent-ink">
              Heard · {who(state.speaker)} · {state.speaker === "doctor" ? "English" : props.patientLanguageLabel} · correct any wrong words, especially medicines and doses
            </span>
            <textarea
              className="min-h-16 rounded-btn border border-border-strong/50 bg-white p-2.5 text-[14px] leading-relaxed"
              value={state.text}
              onChange={(e) => talk.edit(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={sending || props.busy || !state.text.trim()} onClick={sendReviewed}>
              {sending ? "Checking…" : "Check translation"}
            </Button>
            <Button variant="ghost" disabled={sending} onClick={() => talk.reset("Discarded. Nothing was sent.")}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-3">
        <textarea
          aria-label="Type a line"
          className="min-h-16 rounded-btn border border-border-strong/50 bg-white p-2.5 text-[14px] leading-relaxed"
          placeholder={typedAsPatient ? `What the patient said (${props.patientLanguageLabel})` : "Or type what you want to say to the patient"}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={props.busy || sending || !typed.trim()}
            onClick={async () => {
              if (await submit(typedAsPatient ? "patient_to_doctor" : "doctor_to_patient", typed)) setTyped("");
            }}
          >
            Check translation
          </Button>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={typedAsPatient} onChange={(e) => setTypedAsPatient(e.target.checked)} />
            This is the patient speaking
          </label>
        </div>
      </div>
    </div>
  );
}
