"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR for `text`, drawn locally as SVG by the qrcode package (no network). */
export function QrCode({ text, className, testId }: { text: string; className?: string; testId?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [text]);
  if (!svg) return null;
  return (
    <div
      className={`appear rounded-card border border-border bg-white p-2 shadow-[0_1px_2px_rgb(10_10_10/0.06)] ${className ?? ""}`}
      role="img"
      aria-label="QR code for the patient check-in link"
      data-testid={testId}
      // Generated locally from our own link; contains no user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export const ENTRANCE_WINDOW = "careloop-entrance";

/** Opens (or focuses) the small entrance window. Call inside a click handler so it is not blocked. */
export function openEntranceWindow() {
  window.open("/entrance", ENTRANCE_WINDOW, "popup,width=440,height=620");
}
