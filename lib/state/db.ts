// Database connection and the per-request context shared by every service function.
import Database from "better-sqlite3";
import { loadMasterKey } from "@/lib/privacy/crypto";
import { appConfig } from "@/lib/config";
import { createAi, type Ai, type AiAdapter } from "@/lib/ai";
import { RESET_TABLES, SCHEMA, SCHEMA_VERSION } from "./schema";

export type DB = Database.Database;

export interface Ctx {
  db: DB;
  masterKey: Buffer;
  now: () => Date;
  /** Returns the AI client for the current MOCK_AI setting. */
  ai: () => Ai;
  /** Clock for the ID day. The seed backdates arrivals but still issues today's IDs. Defaults to now. */
  idClock?: () => Date;
  /** Last time a decryption for each viewer was audited (throttles audit entries from polling). */
  decryptAuditAt: Map<string, number>;
}

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  if ((db.pragma("user_version", { simple: true }) as number) < SCHEMA_VERSION) {
    // Demo databases hold synthetic data only, so an old shape is dropped and rebuilt rather than migrated.
    db.pragma("foreign_keys = OFF");
    for (const t of RESET_TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.pragma("foreign_keys = ON");
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(SCHEMA);
  const upsert = db.prepare(
    "INSERT INTO doctors (id, name, cubicle) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, cubicle = excluded.cubicle",
  );
  for (const d of appConfig.doctors) upsert.run(d.id, d.name, d.cubicle);
  return db;
}

export function isMockAi(db: DB): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'mock_ai'").get() as
    | { value: string }
    | undefined;
  if (row) return row.value === "1";
  return process.env.MOCK_AI !== "0";
}

export function setMockAi(db: DB, on: boolean): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('mock_ai', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(on ? "1" : "0");
}

export interface CtxOptions {
  dbPath?: string;
  masterKey?: Buffer;
  now?: () => Date;
  adapter?: AiAdapter;
}

export function createCtx(opts: CtxOptions = {}): Ctx {
  // On Vercel only /tmp is writable. It is per server instance and is wiped when the instance is recycled.
  const db = openDb(opts.dbPath ?? process.env.DB_PATH ?? (process.env.VERCEL ? "/tmp/care-loop.db" : "./care-loop.db"));
  return {
    db,
    masterKey: opts.masterKey ?? loadMasterKey(),
    now: opts.now ?? (() => new Date()),
    ai: () => createAi({ mock: isMockAi(db), adapter: opts.adapter }),
    decryptAuditAt: new Map(),
  };
}

/** Context with a different clock, sharing everything else (used by the seed). */
export function withClock(ctx: Ctx, now: () => Date): Ctx {
  return { ...ctx, now };
}

const globalForCtx = globalThis as unknown as { __careLoopCtx?: Ctx };

/** The app-wide context for route handlers. Cached on globalThis so dev hot reload keeps one connection. */
export function getCtx(): Ctx {
  if (!globalForCtx.__careLoopCtx) globalForCtx.__careLoopCtx = createCtx();
  return globalForCtx.__careLoopCtx;
}
