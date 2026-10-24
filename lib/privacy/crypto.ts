// privacy/crypto.ts
// Dependency-free privacy helpers for a hackathon prototype (Node.js 18+, e.g. in Next.js API routes).
//
// What this gives you:
//   1. Envelope encryption at rest   -> a database breach alone exposes ciphertext only.
//   2. Pseudonymisation before AI    -> identifiers are swapped for tokens before text leaves your server.
//   3. A hash-chained audit log      -> tamper-evident record of who did what (no plaintext inside).
//
// What it does NOT give you: "zero-knowledge". Your server (and any AI API you call) still sees
// plaintext transiently while processing. Pitch it as minimisation + encryption at rest.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit random IV, the standard size for GCM
const TAG_BYTES = 16;

// ---------------------------------------------------------------------------
// 1. Envelope encryption
// ---------------------------------------------------------------------------

export interface Sealed {
  iv: string; // base64
  ct: string; // base64 ciphertext
  tag: string; // base64 GCM auth tag
}

export interface EncryptedField {
  v: 1;
  kid: string; // which master key wrapped the data key (lets you rotate keys later)
  data: Sealed; // the plaintext, encrypted with a one-off data key
  wrappedKey: Sealed; // that data key, encrypted with the master key
}

function seal(key: Buffer, plaintext: Buffer, aad: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function open(key: Buffer, s: Sealed, aad: string): Buffer {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(s.iv, "base64"), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.ct, "base64")), decipher.final()]);
}

/** Generate a fresh master key once, then keep it OUTSIDE the database (env var / secret manager). */
export function generateMasterKeyBase64(): string {
  return randomBytes(32).toString("base64");
}

export function loadMasterKey(b64: string | undefined = process.env.MASTER_KEY_BASE64): Buffer {
  if (!b64) throw new Error("MASTER_KEY_BASE64 is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("Master key must be 32 bytes, base64-encoded");
  return key;
}

/**
 * Encrypt one sensitive field.
 * `context` binds the ciphertext to its record, e.g. `${appointmentId}:barrierNote`.
 * Decryption fails if the ciphertext is moved to a different record or field.
 */
export function encryptField(
  plaintext: string,
  masterKey: Buffer,
  context: string,
  kid = "k1",
): EncryptedField {
  const dataKey = randomBytes(32); // one-off key for this field
  try {
    return {
      v: 1,
      kid,
      data: seal(dataKey, Buffer.from(plaintext, "utf8"), context),
      wrappedKey: seal(masterKey, dataKey, `${context}|dek`),
    };
  } finally {
    dataKey.fill(0); // best effort only; JavaScript cannot guarantee memory is wiped
  }
}

/** Decrypt on the server, after your role check passes. Throws if anything was tampered with. */
export function decryptField(enc: EncryptedField, masterKey: Buffer, context: string): string {
  const dataKey = open(masterKey, enc.wrappedKey, `${context}|dek`);
  try {
    return open(dataKey, enc.data, context).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/** For the "simulate breach" toggle: what an attacker with only the database would see. */
export function breachView(enc: EncryptedField): string {
  return `${enc.data.ct.slice(0, 48)}...`;
}

// ---------------------------------------------------------------------------
// 2. Pseudonymisation before any cloud AI call
// ---------------------------------------------------------------------------

export interface Identifiers {
  name?: string;
  phone?: string;
  nhsNumber?: string;
  dob?: string;
  email?: string;
}

export type PseudoMap = Record<string, string>; // token -> original

// Catch-all patterns for identifiers the transcript might contain. Over-redacting is the safe failure.
const PATTERNS: Array<[string, RegExp]> = [
  ["PHONE", /(?:\+44\s?7\d{3}|\b07\d{3})[\s-]?\d{3}[\s-]?\d{3}\b/g],
  ["NHSNO", /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/g],
  ["EMAIL", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ["DATE", /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g],
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replace known identifiers (and anything matching the patterns above) with tokens like [[NAME_1]].
 * Keep `map` on the server; never send it to an AI provider.
 * Limits: regexes are not foolproof, and speech-to-text providers still hear the raw audio.
 */
export function pseudonymise(
  text: string,
  ids: Identifiers = {},
): { text: string; map: PseudoMap } {
  const map: PseudoMap = {};
  let n = 0;
  let out = text;

  const tokenFor = (kind: string, original: string): string => {
    for (const [tok, val] of Object.entries(map)) if (val === original) return tok;
    const tok = `[[${kind}_${++n}]]`;
    map[tok] = original;
    return tok;
  };

  // Order matters: structured identifiers first (so an email is tokenised whole before any name
  // inside it is touched), then the catch-all patterns, then names last.
  const literals: Array<[string, string | undefined]> = [
    ["PHONE", ids.phone],
    ["NHSNO", ids.nhsNumber],
    ["DOB", ids.dob],
    ["EMAIL", ids.email],
  ];
  for (const [kind, value] of literals) {
    if (!value) continue;
    out = out.replace(new RegExp(escapeRegExp(value), "gi"), () => tokenFor(kind, value));
  }

  for (const [kind, re] of PATTERNS) {
    out = out.replace(re, (m) => tokenFor(kind, m));
  }

  if (ids.name) {
    // Full name first, then each part on its own. Unicode-aware boundaries so "Ali" does not
    // match inside "Alice", and so non-Latin names (e.g. Arabic) are handled.
    const parts = [ids.name, ...ids.name.split(/\s+/).filter((p) => p.length > 1)];
    for (const part of parts) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, "giu");
      out = out.replace(re, () => tokenFor("NAME", part));
    }
  }

  return { text: out, map };
}

/** Put the real values back after the AI step. Test this with your translation model: some models alter tokens. */
export function restore(text: string, map: PseudoMap): string {
  let out = text;
  for (const [tok, val] of Object.entries(map)) out = out.split(tok).join(val);
  return out;
}

// ---------------------------------------------------------------------------
// 3. Hash-chained audit log (tamper-evident, stores hashes not plaintext)
// ---------------------------------------------------------------------------

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string; // e.g. "verifier:amira" or "agent:safety-checker"
  action: string; // e.g. "translation.verified"
  refId: string; // which utterance / appointment this concerns
  detailHash: string; // SHA-256 of the sensitive detail, never the detail itself
  prevHash: string;
  hash: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const GENESIS = "0".repeat(64);

// Fixed field order, so the hash survives a round-trip through a database.
const canonical = (e: Omit<AuditEntry, "hash">) =>
  JSON.stringify([e.seq, e.ts, e.actor, e.action, e.refId, e.detailHash, e.prevHash]);

export function appendAudit(
  chain: AuditEntry[],
  e: { actor: string; action: string; refId: string; detail: string; ts?: string },
): AuditEntry {
  const base: Omit<AuditEntry, "hash"> = {
    seq: chain.length,
    ts: e.ts ?? new Date().toISOString(),
    actor: e.actor,
    action: e.action,
    refId: e.refId,
    detailHash: sha256(e.detail),
    prevHash: chain.length ? chain[chain.length - 1].hash : GENESIS,
  };
  const entry: AuditEntry = { ...base, hash: sha256(canonical(base)) };
  chain.push(entry);
  return entry;
}

export function verifyChain(chain: AuditEntry[]): { ok: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const { hash, ...base } = chain[i];
    if (base.seq !== i || base.prevHash !== prev || sha256(canonical(base)) !== hash) {
      return { ok: false, brokenAt: i };
    }
    prev = hash;
  }
  return { ok: true };
}
