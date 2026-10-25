import { randomUUID } from "node:crypto";
import { getCtx } from "@/lib/state/db";
import { join, liveVersion, subscribe, type Presence } from "@/lib/live";
import { checkCode, currentShift } from "@/lib/state/shift";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events. Sends `change` after every write so the window refetches its state at once, and
 * `ended` when the session it joined has ended. While the stream is open the caller counts as connected.
 * Query: role=nurse&id=N-01 · role=doctor&id=D-03&code=… · role=patient&token=…
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const role = q.get("role");
  const ctx = getCtx();

  let who: Presence | null = null;
  let stillValid: () => boolean = () => true;
  const since = ctx.now().toISOString();
  if (role === "nurse") {
    who = { role, id: q.get("id") ?? "nurse", since };
  } else if (role === "doctor") {
    const code = q.get("code");
    const shift = checkCode(ctx, code);
    if (!shift) return new Response("Session code is not valid, or the session has ended", { status: 403 });
    who = { role, id: q.get("id") ?? "doctor", since };
    stillValid = () => currentShift(ctx)?.id === shift.id;
  } else if (role === "patient") {
    const row = ctx.db.prepare("SELECT display_id FROM visits WHERE token = ?").get(q.get("token") ?? "") as
      | { display_id: string }
      | undefined;
    if (!row) return new Response("Visit not found", { status: 404 });
    who = { role, id: row.display_id, since };
  } else {
    return new Response("role must be nurse, doctor or patient", { status: 400 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };
      const leave = join(randomUUID(), who);
      const unsubscribe = subscribe((v) => {
        if (!stillValid()) {
          send("ended", "1");
          cleanup();
          try {
            controller.close();
          } catch {}
          return;
        }
        send("change", String(v));
      });
      const beat = setInterval(() => send("ping", String(liveVersion())), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(beat);
        unsubscribe();
        leave();
        cleanup = () => {};
      };
      req.signal.addEventListener("abort", () => cleanup());
      // A comment line of padding first: some proxies (for example tunnels) hold a stream until a few KB arrive.
      controller.enqueue(encoder.encode(`: ${" ".repeat(2048)}\n\n`));
      send("change", String(liveVersion()));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
