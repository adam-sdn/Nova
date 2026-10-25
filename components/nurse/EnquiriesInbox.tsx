"use client";

import { useState } from "react";
import type { EnquiryTier, EnquiryView } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel, type ChipVariant } from "@/lib/ui";
import { inboxItems, matchesFilter, type InboxFilter } from "./boardLogic";

type Act = (url: string, body?: Record<string, unknown>) => Promise<void>;

const TIER_CHIP: Record<EnquiryTier, { variant: ChipVariant; label: string }> = {
  urgent: { variant: "urgent", label: "Urgent" },
  high: { variant: "high", label: "High" },
  routine: { variant: "routine", label: "Routine" },
  needs_review: { variant: "enquiry", label: "Needs review" },
};

const TIER_LABEL: Record<"urgent" | "high" | "routine", string> = { urgent: "Urgent", high: "High", routine: "Routine" };

const FILTERS: InboxFilter[] = ["all", "urgent", "high", "routine"];
const FILTER_LABEL: Record<InboxFilter, string> = { all: "All", urgent: "Urgent", high: "High", routine: "Routine" };

interface Props {
  enquiries: EnquiryView[];
  now: string | null;
  act: Act;
  openCard: (visitId: string) => void;
}

export function EnquiriesInbox({ enquiries, now, act, openCard }: Props) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const items = inboxItems(enquiries);
  const visible = items.filter((i) => matchesFilter(i, filter));
  const count = (f: InboxFilter) => items.filter((i) => matchesFilter(i, f)).length;

  return (
    <aside aria-label="Patient enquiries" className="flex min-w-0 max-w-[380px] flex-[1_1_340px] flex-col rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border px-3.5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">Enquiries</h2>
          <span className="rounded-full border border-routine-border bg-column px-2 py-0.5 text-xs font-semibold">{items.length} open</span>
        </div>
        <div className="mt-0.5 text-xs text-muted">Priority suggested by AI · nurse confirms</div>
        <div role="group" aria-label="Filter enquiries" className="mt-2.5 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f}
              aria-pressed={filter === f}
              variant={filter === f ? "primary" : "secondary"}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]} {count(f)}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <div className="px-3.5 py-3 text-[13px] text-muted">No open enquiries.</div>}

      {visible.map(({ enquiry: q, tier, suggestion, reason }) => (
        <article key={q.id} data-testid="inbox-item" className="flex flex-col gap-2 border-b border-column px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="text-[15px]">{q.displayId}</Mono>
            <Chip variant={TIER_CHIP[tier].variant}>{TIER_CHIP[tier].label}</Chip>
            <span className="text-xs text-muted">
              {q.kind === "feel_worse" ? "I feel worse" : (q.category ?? "Enquiry")}
              {now ? ` · waiting ${sinceLabel(q.createdAt, now)}` : ""}
            </span>
          </div>
          <div className="text-sm leading-snug">“{q.text}”</div>
          {q.originalLang && q.originalLang.toLowerCase() !== "en" && (
            <div className="text-xs text-muted">Translated from {q.originalLang.toUpperCase()}</div>
          )}
          <div className="rounded-[8px] bg-ground px-2.5 py-2 text-[13px] leading-snug text-routine-ink">
            {/* TODO(ai): the suggested tier is a hardcoded keyword match (lib/rules/enquiry/priority.ts). */}
            Suggested: {TIER_LABEL[suggestion]} · {reason}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary" onClick={() => openCard(q.visitId)}>
              Open card
            </Button>
            <Button onClick={() => act(`/api/enquiries/${q.id}/handle`)}>Mark handled</Button>
            <label className="flex items-center gap-1 text-xs font-semibold text-routine-ink">
              Set priority
              <select
                aria-label={`Set priority for ${q.displayId}`}
                className="min-h-11 rounded-[8px] border border-border-strong bg-surface px-1 text-[13px]"
                value={q.tier}
                onChange={(e) => act(`/api/enquiries/${q.id}/priority`, { tier: e.target.value })}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="routine">Routine</option>
                <option value="needs_review">Needs review</option>
              </select>
            </label>
          </div>
        </article>
      ))}
    </aside>
  );
}
