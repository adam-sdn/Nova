// Shared UI primitives. Only the Stage 0 session changes these; screens compose them.
"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { ArrowIcon, BubbleIcon, CheckIcon, ChevronUpIcon, ClockIcon, DotIcon, MicIcon, TriangleIcon } from "./icons";

export * from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Button: min height 44px, radius 8px (SPEC section 13)
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent text-white hover:bg-accent-ink",
  secondary: "border-border-strong bg-surface text-ink hover:bg-ground",
  danger: "border-urgent-border bg-urgent-fill text-urgent-ink hover:brightness-95",
};

export function Button({
  variant = "secondary",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[8px] border px-3.5 text-[13px] font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Chip: always text plus an icon, never colour alone
// ---------------------------------------------------------------------------

export type ChipVariant = "urgent" | "high" | "routine" | "longWait" | "note" | "escort" | "enquiry" | "verified" | "demo";

const chipStyles: Record<ChipVariant, string> = {
  urgent: "text-urgent-ink bg-urgent-fill border-urgent-border",
  high: "text-high-ink bg-high-fill border-high-border",
  longWait: "text-high-ink bg-high-fill border-high-border",
  routine: "text-routine-ink bg-routine-fill border-routine-border",
  enquiry: "text-routine-ink bg-routine-fill border-routine-border",
  note: "text-accent-ink bg-accent-tint border-accent-border",
  escort: "text-accent-ink bg-accent-tint border-accent-border",
  verified: "text-accent-ink bg-accent-tint border-accent-border",
  demo: "text-demo-ink bg-demo-fill border-demo-border",
};

const chipIcons: Record<ChipVariant, ReactNode> = {
  urgent: <TriangleIcon />,
  high: <ChevronUpIcon />,
  longWait: <ClockIcon />,
  routine: <DotIcon />,
  enquiry: <BubbleIcon />,
  note: <MicIcon />,
  escort: <ArrowIcon />,
  verified: <CheckIcon />,
  demo: <DotIcon />,
};

const defaultLabels: Record<ChipVariant, string> = {
  urgent: "Urgent",
  high: "High",
  routine: "Routine",
  longWait: "Long wait",
  enquiry: "Enquiry",
  note: "Notes capturing",
  escort: "Escort requested",
  verified: "Translation verified",
  demo: "Demo data",
};

export function Chip({ variant, children, className }: { variant: ChipVariant; children?: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-px text-xs font-semibold",
        chipStyles[variant],
        className,
      )}
    >
      {chipIcons[variant]}
      {children ?? defaultLabels[variant]}
    </span>
  );
}

/** The "Demo data" pill shown on every staff screen (I4). */
export function DemoTag() {
  return (
    <span className="rounded-full border border-demo-border bg-demo-fill px-3 py-1.5 text-[13px] font-semibold text-demo-ink">
      Demo data
    </span>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("rounded-[12px] border border-border bg-surface p-3.5", className)} {...rest} />;
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-[10px] border border-border bg-surface p-3", className)} {...rest} />;
}

/** A board column: column fill, radius 12px. */
export function Column({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("flex min-w-0 flex-col gap-2.5 rounded-[12px] bg-column p-2.5", className)} {...rest} />;
}

/** Patient IDs and session numbers are set in IBM Plex Mono. */
export function Mono({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("font-mono font-semibold", className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// usePoll: each window polls GET /api/state every 1 to 2 seconds
// ---------------------------------------------------------------------------

export interface PollResult<T> {
  data: T | null;
  error: string | null;
  /** Fetch now (for example straight after an action). */
  refresh: () => Promise<void>;
}

export function usePoll<T>(url: string | null, ms = 1500): PollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const res = await fetch(u, { cache: "no-store" });
      const json = await res.json();
      if (urlRef.current !== u) return;
      if (!res.ok) setError(json?.error?.message ?? `Request failed (${res.status})`);
      else {
        setData(json as T);
        setError(null);
      }
    } catch {
      setError("Cannot reach the server");
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    void refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
  }, [url, ms, refresh]);

  return { data, error, refresh };
}

/** POST JSON to an API route. Throws an Error with the server's message on failure. */
export async function postJson<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

/** "12m", "1h 05m": time since an ISO timestamp. */
export function sinceLabel(fromIso: string, nowIso: string): string {
  const mins = Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(fromIso)) / 60_000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
