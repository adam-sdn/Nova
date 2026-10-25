"use client";

import { useState } from "react";
import { Button, Mono } from "@/lib/ui";
import type { DoctorInfo } from "./types";

export const TEXT_SIZES = [
  { id: "standard", label: "Standard", zoom: 1 },
  { id: "large", label: "Large", zoom: 1.15 },
  { id: "larger", label: "Larger", zoom: 1.3 },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["id"];

export function Settings({
  me,
  code,
  textSize,
  onTextSize,
  onLeave,
}: {
  me: DoctorInfo;
  code: string;
  textSize: TextSize;
  onTextSize: (s: TextSize) => void;
  onLeave: () => void;
}) {
  const [shown, setShown] = useState(false);
  const row = "flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-3.5 last:border-b-0";
  return (
    <section aria-label="Settings" className="flex max-w-[640px] flex-col gap-3" data-testid="doctor-settings">
      <h2 className="text-[20px] font-semibold">Settings</h2>
      <div className="surface rounded-[18px] px-5">
        <div className={row}>
          <span className="text-[14px] font-semibold">Doctor</span>
          <span className="text-[14px]">
            {me.name} · <Mono>{me.id}</Mono> · {me.cubicle}
          </span>
        </div>
        <div className={row}>
          <span className="text-[14px] font-semibold">Session code</span>
          <button
            type="button"
            className="pressable min-h-11 rounded-[12px] border border-border bg-ground px-3.5 text-[14px] font-semibold hover:bg-white"
            onClick={() => setShown(!shown)}
            data-testid="doctor-code"
          >
            {shown ? <Mono className="tracking-[0.2em]">{code}</Mono> : "•••••• Tap to reveal"}
          </button>
        </div>
        <div className={row}>
          <span className="text-[14px] font-semibold">Text size</span>
          <div className="segmented w-[300px] max-w-full" role="radiogroup" aria-label="Text size">
            <span
              aria-hidden="true"
              className="segmented-thumb"
              style={{
                width: `calc((100% - 8px) / ${TEXT_SIZES.length})`,
                transform: `translateX(${TEXT_SIZES.findIndex((t) => t.id === textSize) * 100}%)`,
              }}
            />
            {TEXT_SIZES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={textSize === t.id}
                className={`relative z-10 min-h-10 rounded-full px-3 text-[13px] font-semibold transition-colors duration-150 ${textSize === t.id ? "text-accent-ink" : "text-muted hover:text-ink"}`}
                onClick={() => onTextSize(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className="text-[14px] text-muted">Leaving keeps your patients and follow-ups. Join again with the code.</span>
          <Button onClick={onLeave}>Leave session</Button>
        </div>
      </div>
    </section>
  );
}
