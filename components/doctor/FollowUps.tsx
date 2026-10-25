"use client";

import { useState } from "react";
import type { FollowUpView } from "@/lib/contracts";
import { Button, Chip, Mono, sinceLabel } from "@/lib/ui";

type Act = (path: string, body?: Record<string, unknown>) => Promise<unknown>;

const GROUPS: { status: FollowUpView["status"]; title: string; hint: string }[] = [
  { status: "suggested", title: "To confirm", hint: "Drafted by AI from your signed assessment. Check each one before it joins your list." },
  { status: "confirmed", title: "To do", hint: "Confirmed by you" },
  { status: "done", title: "Done", hint: "" },
];

export function FollowUps({ items, now, act, busy }: { items: FollowUpView[]; now: string; act: Act; busy: boolean }) {
  return (
    <section aria-label="Follow-ups" className="flex flex-col gap-5" data-testid="follow-ups">
      <div>
        <h2 className="text-[20px] font-semibold">Follow-ups</h2>
        <p className="text-[13px] text-muted">Tasks from your consultations. Only you and the care team see these, never the patient.</p>
      </div>
      {items.length === 0 && <div className="text-[14px] text-muted">No follow-ups yet. They appear here when you complete a consultation.</div>}
      {GROUPS.map((g) => {
        const list = items.filter((f) => f.status === g.status);
        if (list.length === 0) return null;
        return (
          <div key={g.status} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-[16px] font-semibold">{g.title}</h3>
              <span className="rounded-ctl bg-onyx px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{list.length}</span>
              <span className="text-[13px] text-muted">{g.hint}</span>
            </div>
            {list.map((f) => (
              <FollowUpRow key={f.id} f={f} now={now} act={act} busy={busy} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function FollowUpRow({ f, now, act, busy }: { f: FollowUpView; now: string; act: Act; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.text);
  return (
    <article data-testid={`follow-up-${f.id}`} className="surface appear liftable flex flex-col gap-2.5 rounded-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Mono className="text-[15px]">{f.displayId}</Mono>
        <span className="text-muted">Session {f.sessionNumber} · {sinceLabel(f.createdAt, now)} ago</span>
        {f.status === "suggested" && <Chip variant="note">AI draft{f.fromSection ? ` · from ${f.fromSection}` : ""}</Chip>}
        {f.status === "confirmed" && <Chip variant="verified">Confirmed</Chip>}
        {f.status === "done" && <Chip variant="routine">Done</Chip>}
      </div>
      {editing ? (
        <textarea
          aria-label="Follow-up wording"
          className="min-h-16 rounded-btn border border-border-strong/60 p-2.5 text-[14px] leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <div className={`text-[15px] ${f.status === "done" ? "text-muted line-through" : ""}`}>{f.text}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {f.status === "suggested" && (
          <>
            <Button
              variant="primary"
              disabled={busy || (editing && !text.trim())}
              onClick={() => act(`/api/follow-ups/${f.id}/confirm`, editing && text !== f.text ? { text } : {})}
            >
              {editing ? "Save and confirm" : "Confirm"}
            </Button>
            {!editing && <Button onClick={() => setEditing(true)}>Edit</Button>}
            <Button disabled={busy} onClick={() => act(`/api/follow-ups/${f.id}/dismiss`)}>
              Dismiss
            </Button>
          </>
        )}
        {f.status === "confirmed" && (
          <Button variant="primary" disabled={busy} onClick={() => act(`/api/follow-ups/${f.id}/done`)}>
            Mark done
          </Button>
        )}
      </div>
    </article>
  );
}
