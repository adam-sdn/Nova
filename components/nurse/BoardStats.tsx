"use client";

// Summary row above the board, after the "Stats Card" pattern on 21st.dev's ui-dashboard collection
// (https://21st.dev/@kavikatiyar/components/stats-card-1): one metric, a label and a quiet icon per card.
// Counts only what the board already shows; nothing new is derived or predicted.
import { Clock, DoorOpen, MessageCircle, Stethoscope, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { EnquiryView, VisitCard } from "@/lib/contracts";
import { BOARD_COLUMNS, cardChips } from "./boardLogic";

interface Stat {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Warn styling (amber) when the value is above zero. Always paired with text. */
  warn?: boolean;
}

export function BoardStats({ visits, enquiries, now, longWaitMinutes }: { visits: VisitCard[]; enquiries: EnquiryView[]; now: string; longWaitMinutes: number }) {
  const inCol = (id: string) => visits.filter((v) => BOARD_COLUMNS.find((c) => c.id === id)!.statuses.includes(v.status)).length;
  const stats: Stat[] = [
    { label: "Arrival", value: inCol("arrival"), icon: DoorOpen },
    { label: "Triage", value: inCol("triage"), icon: UserRoundCheck },
    { label: "Assessment", value: inCol("assessment"), icon: Stethoscope },
    { label: "Long waits", value: visits.filter((v) => cardChips(v, now, longWaitMinutes).some((c) => c.variant === "longWait")).length, icon: Clock, warn: true },
    { label: "Open enquiries", value: enquiries.filter((e) => e.status === "open").length, icon: MessageCircle, warn: true },
  ];
  return (
    <ul aria-label="Board summary" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="board-stats">
      {stats.map((s) => {
        const hot = s.warn && s.value > 0;
        return (
          <li key={s.label} className="surface flex items-center gap-3 rounded-[20px] px-4 py-3.5 last:col-span-2 sm:last:col-span-1">
            <span
              aria-hidden="true"
              className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${hot ? "bg-high-fill text-high-ink" : "bg-accent-tint text-accent-ink"}`}
            >
              <s.icon size={19} strokeWidth={1.9} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[24px] font-semibold leading-none tabular-nums tracking-tight">{s.value}</span>
              <span className={`mt-1 truncate text-[13px] ${hot ? "font-semibold text-high-ink" : "text-muted"}`}>{s.label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
