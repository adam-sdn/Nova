"use client";

import { useState } from "react";
import type { MessageView } from "@/lib/contracts";
import { Button, Chip, type ChipVariant } from "@/lib/ui";
import { canSend, messageChip, PENDING_BACK_TRANSLATION, type MessageChipKind } from "@/lib/agents/doctor/board";
import { PlayAloud } from "./PlayAloud";
import { languageName } from "./types";

const chipVariant: Record<MessageChipKind, ChipVariant> = {
  checking: "routine",
  ready: "verified",
  held: "urgent",
  delivered: "verified",
  aiChecked: "verified",
  needsChecking: "high",
};

type Act = (path: string, body?: Record<string, unknown>) => Promise<void>;

export function MessageCard({ m, index, lang, langLabel, act }: { m: MessageView; index: number; lang: string; langLabel: string; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.source);
  const [attesting, setAttesting] = useState(false);
  const [reason, setReason] = useState("");
  const chip = messageChip(m.status);
  const base = `/api/sessions/${m.sessionId}/messages/${m.id}`;
  const heldish = m.status === "held" || m.status === "escalated" || m.status === "flagged";

  if (m.direction === "patient_to_doctor") {
    return (
      <div className="appear rounded-card bg-black/[0.03] p-3.5" data-testid="message-card">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
          <span>
            {index}. Patient · translated from {langLabel}
          </span>
          <Chip variant={chipVariant[chip.kind]}>{chip.label}</Chip>
        </div>
        <div className="mt-1 text-[14px]">{m.translation ?? "…"}</div>
        <div className="mt-1 text-[13px] text-muted">Original: {m.source}</div>
        {m.status === "needs_checking" && (
          <div className="mt-1 text-[13px] text-high-ink">Ask a clarifying question to confirm this line.</div>
        )}
      </div>
    );
  }

  return (
    <div className="appear rounded-card border border-black/[0.08] bg-surface p-3.5" data-testid="message-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span>{index}. Doctor · English</span>
        <Chip variant={chipVariant[chip.kind]}>{m.status === "escalated" ? "Held · escalated" : chip.label}</Chip>
      </div>
      <div className="mt-1 text-[14px]">{m.source}</div>
      <div className="mt-2 rounded-btn border border-accent-border bg-accent-tint p-2.5 text-[14px] text-accent-ink">
        The patient will read: {m.backTranslation ?? PENDING_BACK_TRANSLATION}
      </div>
      {m.translation && (
        <div className="mt-1.5 text-[13px] text-muted" data-testid="message-translation">
          In {languageName(lang)}: <span lang={lang}>{m.translation}</span>
        </div>
      )}
      {m.status === "delivered" && m.translation && <PlayAloud text={m.translation} lang={lang} langLabel={languageName(lang)} />}
      <details className="mt-2 text-[12px] text-muted">
        <summary className="cursor-pointer">Checks and agent trace</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify({ safety: m.safety, aiChecks: m.aiChecks, trace: m.trace }, null, 1)}</pre>
      </details>
      {heldish && <div className="mt-2 text-[13px] font-semibold text-urgent-ink">Use the hospital interpreter service</div>}
      {m.attestation && <div className="mt-1 text-[13px] text-muted">Handled with interpreter service ({m.attestation.doctorId})</div>}
      {editing && (
        <div className="mt-2 flex gap-2">
          <input aria-label="Edit message" className="min-h-11 flex-1 rounded-btn border border-border-strong/50 px-2.5" value={text} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" disabled={!text.trim()} onClick={() => act(`${base}/recheck`, { text }).then(() => setEditing(false))}>
            Recheck
          </Button>
        </div>
      )}
      {attesting && (
        <div className="mt-2 flex gap-2">
          <input aria-label="Attestation reason" placeholder="Reason" className="min-h-11 flex-1 rounded-btn border border-border-strong/50 px-2.5" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="primary" disabled={!reason.trim()} onClick={() => act(`${base}/attest`, { kind: "handled_with_interpreter_service", reason }).then(() => setAttesting(false))}>
            Record
          </Button>
        </div>
      )}
      {m.status !== "delivered" && !m.attestation && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!canSend(m.status)} onClick={() => act(`${base}/send`)}>
            Send
          </Button>
          <Button onClick={() => setEditing((x) => !x)}>Edit and recheck</Button>
          {m.status !== "escalated" && (
            <Button variant="danger" onClick={() => act(`${base}/escalate`, { reason: "" })}>
              Escalate
            </Button>
          )}
          {heldish && <Button onClick={() => setAttesting((x) => !x)}>Handled with interpreter service</Button>}
        </div>
      )}
    </div>
  );
}
