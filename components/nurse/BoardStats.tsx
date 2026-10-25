"use client";

// Summary row above the board, after the "Stats Card" pattern on 21st.dev's ui-dashboard collection
// (https://21st.dev/@kavikatiyar/components/stats-card-1): label, figure, quiet line icon.
// One solid strip divided by fine rules rather than five floating cards.
// Counts only what the board already shows; nothing new is derived or predicted.
import { Clock, DoorOpen, MessageCircle, Stethoscope, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { EnquiryView, VisitCard } from "@/lib/contracts";
import { BOARD_COLUMNS, cardChips } from "./boardLogic";

interface Stat {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Amber when the value is above zero. Always paired with text. */
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
    <ul
      aria-label="Board summary"
      data-testid="board-stats"
      className="surface mb-4 grid grid-cols-2 overflow-hidden rounded-panel sm:grid-cols-3 lg:grid-cols-5"
    >
      {stats.map((s, i) => {
        const hot = s.warn && s.value > 0;
        // Fine rules between cells: right edge except the last in a row, bottom edge except the last row.
        const rules = [
          i % 2 === 0 && i < stats.length - 1 ? "max-sm:border-r" : "",
          i < 4 ? "max-sm:border-b" : "",
          i % 3 !== 2 && i < stats.length - 1 ? "sm:max-lg:border-r" : "",
          i < 3 ? "sm:max-lg:border-b" : "",
          i < stats.length - 1 ? "lg:border-r" : "",
        ].join(" ");
        return (
          <li
            key={s.label}
            className={`group flex flex-col gap-2 border-black/[0.06] px-4 py-3.5 transition-colors duration-200 hover:bg-black/[0.018] max-sm:last:col-span-2 ${rules}`}
          >
            <span className={`flex items-center justify-between gap-2 text-[12.5px] font-medium ${hot ? "text-high-ink" : "text-muted"}`}>
              <span className="truncate">{s.label}</span>
              <s.icon
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-px ${hot ? "" : "text-border-strong"}`}
              />
            </span>
            <span className={`text-[26px] font-semibold leading-none tabular-nums tracking-[-0.02em] ${hot ? "text-high-ink" : "text-ink"}`}>{s.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
