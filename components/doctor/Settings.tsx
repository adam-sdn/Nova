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
  const row = "flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0";
  return (
    <section aria-label="Settings" className="flex max-w-[640px] flex-col gap-3" data-testid="doctor-settings">
      <h2 className="text-[20px] font-semibold">Settings</h2>
      <div className="rounded-[12px] border border-border bg-surface px-4">
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
            className="min-h-11 rounded-[8px] border border-border-strong bg-column px-3 text-[14px] font-semibold"
            onClick={() => setShown(!shown)}
            data-testid="doctor-code"
          >
            {shown ? <Mono className="tracking-[0.2em]">{code}</Mono> : "•••••• Tap to reveal"}
          </button>
        </div>
        <div className={row}>
          <span className="text-[14px] font-semibold">Text size</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map((t) => (
              <Button key={t.id} role="radio" aria-checked={textSize === t.id} variant={textSize === t.id ? "primary" : "secondary"} onClick={() => onTextSize(t.id)}>
                {t.label}
              </Button>
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
