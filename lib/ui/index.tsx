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

// Primary: tinted glass (teal body, specular top rim, coloured glow). Secondary: clear glass chip.
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "btn-primary border-transparent text-white",
  secondary: "btn-glass border-transparent text-ink",
  danger: "border-urgent-border bg-urgent-fill text-urgent-ink hover:border-urgent-ink/40",
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
        "pressable inline-flex min-h-11 cursor-pointer select-none items-center justify-center gap-2 rounded-full border px-4.5 text-[13px] font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-demo-border bg-demo-fill/80 px-3 py-1.5 text-[13px] font-semibold text-demo-ink">
      <DotIcon />
      Demo data
    </span>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

/** Opaque reading surface. Pass `glass` for chrome that floats over the page (bars, side panels, gates). */
export function Panel({ className, glass, ...rest }: HTMLAttributes<HTMLElement> & { glass?: boolean }) {
  return <section className={cx("rounded-[18px] p-4", glass ? "glass-strong" : "surface", className)} {...rest} />;
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("surface rounded-[14px] p-3", className)} {...rest} />;
}

/** A board column: a soft translucent well. */
export function Column({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("glass-well flex min-w-0 flex-col gap-2.5 rounded-[22px] p-2.5", className)} {...rest} />;
}

/** Patient IDs and session numbers are set in IBM Plex Mono. */
export function Mono({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("font-mono font-semibold", className)} {...rest} />;
}

// ---------------------------------------------------------------------------
// usePoll: each window fetches GET /api/state. With `live`, the server pushes a signal after every change
// (Server-Sent Events, /api/live) and the window refetches at once; polling becomes a slow safety net.
// ---------------------------------------------------------------------------

export interface PollResult<T> {
  data: T | null;
  error: string | null;
  /** Fetch now (for example straight after an action). */
  refresh: () => Promise<void>;
  /** True while the live stream is connected. */
  live: boolean;
}

export interface LiveOptions {
  /** /api/live URL for this window (also marks it as connected for the nurse board). */
  url: string | null;
  /** Called when the session this window joined has ended. */
  onEnded?: () => void;
}

const LIVE_FALLBACK_MS = 10_000;

export function usePoll<T>(url: string | null, ms = 1500, liveOpts?: LiveOptions): PollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const onEnded = useRef(liveOpts?.onEnded);
  onEnded.current = liveOpts?.onEnded;

  const fetchOnce = useCallback(async () => {
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

  // Coalesce: a burst of change signals causes at most one fetch in flight plus one after it.
  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = async () => {
      do {
        again.current = false;
        await fetchOnce();
      } while (again.current);
    };
    inFlight.current = run().finally(() => (inFlight.current = null));
    return inFlight.current;
  }, [fetchOnce]);

  const liveUrl = liveOpts?.url ?? null;
  useEffect(() => {
    if (!liveUrl || !url || typeof EventSource === "undefined") return;
    const es = new EventSource(liveUrl);
    es.addEventListener("open", () => setLive(true));
    es.addEventListener("change", () => void refresh());
    es.addEventListener("ended", () => {
      es.close();
      setLive(false);
      onEnded.current?.();
    });
    es.addEventListener("error", () => setLive(false));
    return () => {
      es.close();
      setLive(false);
    };
  }, [liveUrl, url, refresh]);

  const every = liveUrl ? Math.max(ms, LIVE_FALLBACK_MS) : ms;
  useEffect(() => {
    if (!url) return;
    void refresh();
    const t = setInterval(refresh, every);
    return () => clearInterval(t);
  }, [url, every, refresh]);

  return { data, error, refresh, live };
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
