"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type RecordingState = "idle" | "recording" | "processing" | "ready" | "playing" | "error";

export interface VoiceTurn {
  id: string;
  speaker: "doctor" | "patient";
  originalText: string;
  translatedText: string;
  timestamp: number;
  proposedUpdates?: Record<string, string>;
}

export interface UseVoiceConsultationResult {
  state: RecordingState;
  turns: VoiceTurn[];
  currentTurn: VoiceTurn | null;
  error: string | null;
  isRecording: boolean;
  startRecording: (speaker: "doctor" | "patient") => Promise<void>;
  stopRecording: () => Promise<void>;
  playback: (turnId: string, language: string) => Promise<void>;
  clearError: () => void;
  acceptTurn: (turnId: string) => void;
  rejectTurn: (turnId: string) => void;
  clearTurns: () => void;
}

// Minimal WAV header writer
function createWavFile(audioBuffer: AudioBuffer): Blob {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const channelData: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }

  const frameLength = audioBuffer.length;
  const byteLength = frameLength * blockAlign;

  // WAV header: RIFF container (12 bytes) + fmt chunk (24 bytes) + data chunk (8 bytes) + audio data
  const headerLength = 12 + 24 + 8;
  const totalLength = headerLength + byteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  let offset = 0;
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  };
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };

  writeString("RIFF");
  writeUint32(totalLength - 8);
  writeString("WAVE");

  // fmt chunk
  writeString("fmt ");
  writeUint32(16); // chunk size
  writeUint16(format);
  writeUint16(numberOfChannels);
  writeUint32(sampleRate);
  writeUint32(sampleRate * blockAlign);
  writeUint16(blockAlign);
  writeUint16(bitDepth);

  // data chunk
  writeString("data");
  writeUint32(byteLength);

  // Write audio data (interleaved)
  const volume = 0.8;
  for (let i = 0; i < frameLength; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i])) * volume;
      const s = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function useVoiceConsultation(
  sessionId: string,
  patientLanguage: string,
  doctorLanguage: string,
): UseVoiceConsultationResult {
  const [state, setState] = useState<RecordingState>("idle");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [currentTurn, setCurrentTurn] = useState<VoiceTurn | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentSpeakerRef = useRef<"doctor" | "patient">("doctor");

  const startRecording = useCallback(
    async (speaker: "doctor" | "patient") => {
      try {
        setError(null);
        setState("recording");
        currentSpeakerRef.current = speaker;

        if (!mediaStreamRef.current) {
          mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        audioChunksRef.current = [];

        const mediaRecorder = new MediaRecorder(mediaStreamRef.current);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.start();
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Microphone access denied");
      }
    },
    [],
  );

  const stopRecording = useCallback(
    async () => {
      return new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current) {
          setError("No recording in progress");
          resolve();
          return;
        }

        setState("processing");

        mediaRecorderRef.current.onstop = async () => {
          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
            audioChunksRef.current = [];
            const speaker = currentSpeakerRef.current;

            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.wav");
            formData.append("speaker", speaker);
            formData.append("targetLanguage", speaker === "doctor" ? patientLanguage : doctorLanguage);

            const response = await fetch(`/api/sessions/${sessionId}/voice-turn`, {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error?.message ?? `HTTP ${response.status}`);
            }

            const result = (await response.json()) as {
              originalText: string;
              translatedText: string;
              proposedUpdates?: Record<string, string>;
            };

            const turnId = `turn-${Date.now()}`;
            const newTurn: VoiceTurn = {
              id: turnId,
              speaker,
              originalText: result.originalText,
              translatedText: result.translatedText,
              timestamp: Date.now(),
              proposedUpdates: result.proposedUpdates,
            };

            setCurrentTurn(newTurn);
            setState("ready");
          } catch (err) {
            setState("error");
            setError(err instanceof Error ? err.message : "Failed to process recording");
            resolve();
            return;
          }

          resolve();
        };

        mediaRecorderRef.current.stop();
      });
    },
    [sessionId, patientLanguage, doctorLanguage],
  );

  const playback = useCallback(async (turnId: string, language: string) => {
    setState("playing");
    try {
      const turn = turns.find((t) => t.id === turnId) || currentTurn;
      if (!turn) {
        setError("Turn not found");
        setState("ready");
        return;
      }

      const utterance = new SpeechSynthesisUtterance(turn.translatedText);
      utterance.lang = language;

      await new Promise<void>((resolve) => {
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        speechSynthesis.speak(utterance);
      });

      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playback failed");
      setState("error");
    }
  }, [turns, currentTurn]);

  const acceptTurn = useCallback((turnId: string) => {
    setTurns((cur) => [...cur, currentTurn!]);
    setCurrentTurn(null);
    setState("idle");
  }, [currentTurn]);

  const rejectTurn = useCallback((turnId: string) => {
    setCurrentTurn(null);
    setState("idle");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearTurns = useCallback(() => {
    setTurns([]);
    setCurrentTurn(null);
  }, []);

  return {
    state,
    turns,
    currentTurn,
    error,
    isRecording: state === "recording",
    startRecording,
    stopRecording,
    playback,
    clearError,
    acceptTurn,
    rejectTurn,
    clearTurns,
  };
}
