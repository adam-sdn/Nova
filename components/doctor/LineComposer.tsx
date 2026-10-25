"use client";

import { useRef, useState } from "react";
import { Button } from "@/lib/ui";

type Direction = "doctor_to_patient" | "patient_to_doctor";

/**
 * Typed lines for the consultation. Each line goes through the translation checks before the doctor can
 * send it; a patient line typed here is what the patient said in the room.
 */
export function LineComposer(props: {
  patientLanguageLabel: string;
  busy: boolean;
  onSend: (direction: Direction, text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [asPatient, setAsPatient] = useState(false);
  const [sending, setSending] = useState(false);
  // A ref, not state: two clicks in the same frame would both see sending === false.
  const inFlight = useRef(false);

  const submit = async () => {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setSending(true);
    try {
      if (await props.onSend(asPatient ? "patient_to_doctor" : "doctor_to_patient", text.trim())) setText("");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-card bg-black/[0.03] p-3" data-testid="line-composer">
      <textarea
        aria-label="Type a line"
        className="min-h-16 rounded-btn border border-border-strong/50 bg-white p-2.5 text-[14px] leading-relaxed"
        placeholder={asPatient ? `What the patient said (${props.patientLanguageLabel})` : "Type what you want to say to the patient"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={props.busy || sending || !text.trim()} onClick={submit}>
          {sending ? "Checking…" : "Check translation"}
        </Button>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={asPatient} onChange={(e) => setAsPatient(e.target.checked)} />
          This is the patient speaking
        </label>
      </div>
    </div>
  );
}
