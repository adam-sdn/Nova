// Live updates and presence for one server process (the demo runs a single Next.js server).
// Every successful write bumps `version`; open /api/live streams push it so windows refetch at once.
// Kept on globalThis so dev hot reload and separate route bundles share one copy.
export type PresenceRole = "nurse" | "doctor" | "patient";

export interface Presence {
  role: PresenceRole;
  /** Nurse or doctor ID, or the patient's display ID. Never a name or token. */
  id: string;
  since: string;
}

interface LiveState {
  version: number;
  listeners: Set<(v: number) => void>;
  presence: Map<string, Presence>;
}

const g = globalThis as unknown as { __careLoopLive?: LiveState };
const live = (g.__careLoopLive ??= { version: 0, listeners: new Set(), presence: new Map() });

export const liveVersion = () => live.version;

export function bump(): void {
  live.version++;
  for (const l of live.listeners) l(live.version);
}

export function subscribe(fn: (v: number) => void): () => void {
  live.listeners.add(fn);
  return () => live.listeners.delete(fn);
}

/** Registers a connection; returns the function that removes it. Presence changes count as a change. */
export function join(connId: string, p: Presence): () => void {
  live.presence.set(connId, p);
  bump();
  return () => {
    if (live.presence.delete(connId)) bump();
  };
}

/** Who is connected now, one entry per role and ID (several tabs count once). */
export function connected(): Presence[] {
  const seen = new Map<string, Presence>();
  for (const p of live.presence.values()) {
    const k = `${p.role}:${p.id}`;
    const prev = seen.get(k);
    if (!prev || p.since < prev.since) seen.set(k, p);
  }
  const order: PresenceRole[] = ["nurse", "doctor", "patient"];
  return [...seen.values()].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.id.localeCompare(b.id));
}

/** Drops every doctor and patient connection (the session ended); their streams close themselves. */
export function resetPresence(): void {
  live.presence.clear();
  bump();
}
