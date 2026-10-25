import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SPEECH_LANGUAGES, transcribe } from "@/lib/ai";
import { errorResponse, type Params } from "@/lib/api";
import { getCtx } from "@/lib/state/db";
import { requireCaptureAllowed, TransitionError } from "@/lib/state/service";

const MAX_BYTES = 8 * 1024 * 1024; // about 4 minutes of 16 kHz mono WAV

const Fields = z.object({
  actorId: z.string().min(1).max(40),
  language: z.enum(SPEECH_LANGUAGES),
});

/**
 * One hold-to-talk turn: WAV in, text out. Nothing is stored or translated here; the doctor reviews the text
 * and sends it through the normal message route, which runs the translation checks.
 */
export async function POST(req: Request, route: Params<"id">) {
  let file: string | null = null;
  try {
    const { id } = await route.params;
    const form = await req.formData();
    const fields = Fields.parse({ actorId: form.get("actorId"), language: form.get("language") });
    requireCaptureAllowed(getCtx(), id, { role: "doctor", id: fields.actorId });

    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size > MAX_BYTES) {
      throw new TransitionError("guard_failed", "The recording is missing or too long");
    }
    const buf = Buffer.from(await audio.arrayBuffer());
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
      throw new TransitionError("guard_failed", "The recording must be a WAV file");
    }

    file = path.join(os.tmpdir(), `nova-turn-${randomUUID()}.wav`);
    await writeFile(file, buf);
    try {
      return NextResponse.json({ text: await transcribe(file, fields.language) });
    } catch (e) {
      // OpenWhispr's own message (for example "model not downloaded"); it never contains the speech.
      const message = e instanceof Error ? e.message : "Speech-to-text failed";
      return NextResponse.json({ error: { code: "speech_failed", message } }, { status: 502 });
    }
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (file) await rm(file, { force: true });
  }
}
