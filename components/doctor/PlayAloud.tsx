"use client";

import { Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/lib/ui";

/** An installed voice for the language. Only on-device voices: browser cloud voices would send the text away. */
function localVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const code = lang.toLowerCase();
  return speechSynthesis.getVoices().find((v) => v.localService && v.lang.toLowerCase().split(/[-_]/)[0] === code) ?? null;
}

export function PlayAloud({ text, lang, langLabel }: { text: string; lang: string; langLabel: string }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const pick = () => setVoice(localVoice(lang));
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => speechSynthesis.removeEventListener("voiceschanged", pick);
  }, [lang]);

  const play = () => {
    if (!voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.onend = u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(u);
  };

  return (
    <Button
      variant="ghost"
      className="min-h-11 px-3 text-[12.5px]"
      disabled={!voice || speaking}
      title={voice ? undefined : `No ${langLabel} voice is installed on this computer (Windows Settings → Time & language → Speech)`}
      onClick={play}
    >
      <Volume2 size={14} aria-hidden="true" />
      {voice ? (speaking ? "Playing…" : `Play aloud in ${langLabel}`) : `No ${langLabel} voice installed`}
    </Button>
  );
}
