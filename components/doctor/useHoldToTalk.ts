"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordingToWav } from "@/lib/voice/wav";

export type Speaker = "doctor" | "patient";

export type TalkState =
  | { phase: "idle"; notice?: string }
  | { phase: "starting" | "recording"; speaker: Speaker }
  | { phase: "processing"; speaker: Speaker }
  | { phase: "review"; speaker: Speaker; text: string }
  | { phase: "error"; speaker: Speaker | null; message: string; canRetry: boolean };

const MIN_MS = 500;

/**
 * Hold-to-talk capture. The microphone is opened on press and released on let-go, so nothing is recorded
 * outside a clearly shown turn. The text comes back for review; it is never sent anywhere on its own.
 */
export function useHoldToTalk(opts: { sessionId: string; doctorId: string; languageOf: (s: Speaker) => string }) {
  const [state, setState] = useState<TalkState>({ phase: "idle" });
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const releasedEarly = useRef(false);
  const lastTurn = useRef<{ wav: Blob; speaker: Speaker } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const closeMic = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => closeMic, [closeMic]);

  const send = useCallback(async (wav: Blob, speaker: Speaker) => {
    lastTurn.current = { wav, speaker };
    setState({ phase: "processing", speaker });
    const { sessionId, doctorId, languageOf } = optsRef.current;
    const form = new FormData();
    form.append("actorId", doctorId);
    form.append("language", languageOf(speaker));
    form.append("audio", wav, "turn.wav");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/transcribe`, { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `Speech-to-text failed (${res.status})`);
      if (!json.text) {
        setState({ phase: "error", speaker, message: "No speech was heard. Hold the button and try again.", canRetry: false });
        return;
      }
      setState({ phase: "review", speaker, text: json.text });
    } catch (e) {
      setState({ phase: "error", speaker, message: e instanceof Error ? e.message : "Speech-to-text failed", canRetry: true });
    }
  }, []);

  const start = useCallback(
    async (speaker: Speaker) => {
      if (state.phase === "starting" || state.phase === "recording" || state.phase === "processing") return;
      releasedEarly.current = false;
      setState({ phase: "starting", speaker });
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        stream.current = s;
        if (releasedEarly.current) {
          closeMic();
          setState({ phase: "idle", notice: "Hold the button down while you speak." });
          return;
        }
        chunks.current = [];
        const r = new MediaRecorder(s);
        r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
        r.onstop = async () => {
          closeMic();
          const ms = Date.now() - startedAt.current;
          if (ms < MIN_MS || chunks.current.length === 0) {
            setState({ phase: "idle", notice: "Too short. Hold the button down while you speak." });
            return;
          }
          setState({ phase: "processing", speaker });
          try {
            await send(await recordingToWav(new Blob(chunks.current, { type: r.mimeType })), speaker);
          } catch {
            setState({ phase: "error", speaker, message: "The recording could not be read. Try again.", canRetry: false });
          }
        };
        recorder.current = r;
        startedAt.current = Date.now();
        r.start();
        setState({ phase: "recording", speaker });
      } catch (e) {
        closeMic();
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setState({
          phase: "error",
          speaker,
          message: denied
            ? "Microphone access is blocked. Allow it in the browser's site settings, or type the line below."
            : "No microphone was found. Type the line below instead.",
          canRetry: false,
        });
      }
    },
    [state.phase, closeMic, send],
  );

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    else releasedEarly.current = true;
  }, []);

  const retry = useCallback(() => {
    if (lastTurn.current) void send(lastTurn.current.wav, lastTurn.current.speaker);
  }, [send]);

  const reset = useCallback((notice?: string) => {
    lastTurn.current = null;
    setState({ phase: "idle", notice });
  }, []);

  const edit = useCallback((text: string) => setState((s) => (s.phase === "review" ? { ...s, text } : s)), []);

  return { state, start, stop, retry, reset, edit };
}
