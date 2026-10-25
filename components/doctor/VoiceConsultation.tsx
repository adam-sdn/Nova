"use client";

import { Mic, MicOff, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Button, Chip } from "@/lib/ui";
import { useVoiceConsultation, type VoiceTurn } from "@/lib/hooks/useVoiceConsultation";

interface VoiceConsultationProps {
  sessionId: string;
  patientLanguage: string;
  doctorLanguage: string;
}

const languageLabels: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  zh: "Chinese",
  ur: "Urdu",
  pa: "Punjabi",
  pl: "Polish",
  ro: "Romanian",
};

export function VoiceConsultation({
  sessionId,
  patientLanguage,
  doctorLanguage,
}: VoiceConsultationProps) {
  const voice = useVoiceConsultation(sessionId, patientLanguage, doctorLanguage);
  const [speaker, setSpeaker] = useState<"doctor" | "patient">("doctor");

  const handleStartRecording = async () => {
    await voice.startRecording(speaker);
  };

  const handleStopRecording = async () => {
    await voice.stopRecording();
  };

  const handleAccept = async (turnId: string) => {
    const turn = voice.currentTurn;
    if (!turn) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: turn.speaker === "doctor" ? "doctor_to_patient" : "patient_to_doctor",
          text: turn.originalText,
        }),
      });

      if (!response.ok) {
        voice.clearError();
        const err = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error((err.error as Record<string, unknown>)?.message as string ?? "Failed to add message");
      }

      voice.acceptTurn(turnId);
    } catch (error) {
      voice.clearError();
    }
  };

  const handleReject = (turnId: string) => {
    voice.rejectTurn(turnId);
  };

  const handlePlayback = (turnId: string) => {
    const lang = speaker === "doctor" ? patientLanguage : doctorLanguage;
    void voice.playback(turnId, lang);
  };

  return (
    <div className="flex flex-col gap-4 rounded-card bg-black/[0.03] p-3">
      {/* Recording Controls */}
      <div className="flex flex-col gap-3">
        <div className="text-[13px] font-semibold">Voice Input</div>

        {/* Speaker Toggle */}
        <div className="flex items-center gap-2">
          <label className="flex min-h-9 items-center gap-2 rounded-btn border border-border-strong/50 px-3 text-[13px]">
            <input
              type="radio"
              name="speaker"
              value="doctor"
              checked={speaker === "doctor"}
              onChange={(e) => setSpeaker(e.target.value as "doctor" | "patient")}
              disabled={voice.isRecording}
            />
            Doctor
          </label>
          <label className="flex min-h-9 items-center gap-2 rounded-btn border border-border-strong/50 px-3 text-[13px]">
            <input
              type="radio"
              name="speaker"
              value="patient"
              checked={speaker === "patient"}
              onChange={(e) => setSpeaker(e.target.value as "doctor" | "patient")}
              disabled={voice.isRecording}
            />
            Patient (demo)
          </label>
        </div>

        {/* Record Button */}
        <div className="flex items-center gap-2">
          {voice.state === "recording" ? (
            <Button variant="danger" onClick={handleStopRecording} className="flex-1">
              <MicOff size={16} />
              Recording…
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={voice.state === "processing" || voice.state === "playing"}
              onClick={handleStartRecording}
              className="flex-1"
            >
              <Mic size={16} />
              Hold to record
            </Button>
          )}

          {voice.currentTurn && voice.state !== "recording" && (
            <Button variant="ghost" onClick={() => voice.rejectTurn(voice.currentTurn!.id)}>
              <RotateCcw size={16} />
            </Button>
          )}
        </div>

        {/* State Indicator */}
        {voice.state !== "idle" && (
          <div className="text-[12px] text-muted">
            {voice.state === "recording" && "Recording…"}
            {voice.state === "processing" && "Processing (transcribing & translating)…"}
            {voice.state === "ready" && "Ready to review"}
            {voice.state === "playing" && "Playing back…"}
            {voice.state === "error" && `Error: ${voice.error}`}
          </div>
        )}

        {/* Error Display */}
        {voice.error && (
          <div className="rounded-btn border border-urgent-border bg-urgent-fill px-3 py-2 text-[12px] text-urgent-ink">
            <div className="flex items-center justify-between">
              <span>{voice.error}</span>
              <button onClick={voice.clearError} aria-label="Dismiss error" className="ml-2">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Current Turn Review */}
      {voice.currentTurn && voice.state === "ready" && (
        <div className="rounded-btn border border-accent-border bg-accent-tint p-3">
          <div className="mb-2 text-[12px] font-semibold text-accent-ink">Review before adding to conversation</div>

          <div className="space-y-2">
            <div>
              <div className="text-[11px] text-muted">Original ({languageLabels[doctorLanguage] || "Doctor"})</div>
              <div className="mt-1 text-[13px] leading-relaxed">{voice.currentTurn.originalText}</div>
            </div>

            <div>
              <div className="text-[11px] text-muted">
                Translated ({languageLabels[voice.currentTurn.speaker === "doctor" ? patientLanguage : doctorLanguage] || "Patient"})
              </div>
              <div className="mt-1 text-[13px] leading-relaxed">{voice.currentTurn.translatedText}</div>
            </div>

            {voice.currentTurn.proposedUpdates && Object.keys(voice.currentTurn.proposedUpdates).length > 0 && (
              <div>
                <div className="text-[11px] text-muted">Proposed note updates</div>
                <div className="mt-1 space-y-1">
                  {Object.entries(voice.currentTurn.proposedUpdates).map(([field, text]) => (
                    <div key={field} className="text-[12px]">
                      <span className="font-semibold">{field}:</span> {text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => handleAccept(voice.currentTurn!.id)} className="flex-1">
              Add to conversation
            </Button>
            <Button variant="ghost" onClick={() => handleReject(voice.currentTurn!.id)}>
              Discard
            </Button>
            <Button variant="secondary" onClick={() => handlePlayback(voice.currentTurn!.id)}>
              <Play size={14} />
              Play back
            </Button>
          </div>
        </div>
      )}

      {/* Conversation History */}
      {voice.turns.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-semibold">Conversation ({voice.turns.length} turns)</div>
          {voice.turns.map((turn, idx) => (
            <div key={turn.id} className="rounded-btn border border-border-strong/30 p-2.5 text-[12px]">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{turn.speaker === "doctor" ? "Doctor" : "Patient"}</span>
                  <Chip variant="demo">{idx + 1}</Chip>
                </div>
                <span className="text-[11px] text-muted">{new Date(turn.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="space-y-1">
                <div className="text-muted">{turn.originalText}</div>
                {turn.translatedText && <div className="text-[11px] italic text-border-strong">{turn.translatedText}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
