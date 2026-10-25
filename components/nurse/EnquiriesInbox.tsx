"use client";

import { useState } from "react";
import type { EnquiryTier, EnquiryView } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel, type ChipVariant } from "@/lib/ui";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <aside aria-label="Patient enquiries" className="glass-strong flex min-w-0 max-w-[380px] flex-[1_1_340px] flex-col overflow-hidden rounded-[18px] lg:sticky lg:top-24">
      <div className="border-b border-border/70 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">Enquiries</h2>
          <span className="rounded-full border border-routine-border bg-column px-2 py-0.5 text-xs font-semibold">{items.length} open</span>
        </div>
        <div className="mt-0.5 text-xs text-muted">Priority suggested by AI · nurse confirms</div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as InboxFilter)} className="mt-3">
          <TabsList aria-label="Filter enquiries" className="w-full">
            {FILTERS.map((f) => (
              <TabsTrigger key={f} value={f} className="min-h-9 px-2 text-[13px]">
                {FILTER_LABEL[f]}
                <span className="tabular-nums opacity-70">{count(f)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {visible.length === 0 && <div className="px-4 py-4 text-[13px] text-muted">No open enquiries.</div>}
      <div className="h-2" aria-hidden="true" />

      {visible.map(({ enquiry: q, tier, suggestion, reason }) => (
        <article key={q.id} data-testid="inbox-item" className="appear mx-2 my-1.5 flex flex-col gap-2 rounded-[14px] bg-white/90 px-3.5 py-3 shadow-[0_1px_2px_rgb(20_30_45/0.05)]">
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
          <div className="rounded-[12px] bg-ground px-3 py-2 text-[13px] leading-snug text-routine-ink">
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
                className="min-h-11 rounded-[12px] border border-border-strong/70 bg-surface px-2 text-[13px]"
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
