// privacy/clientNote.ts
// OPTIONAL demo: a "private note" encrypted in the browser with a passphrase, using the Web Crypto API.
// The server only ever stores the returned payload. The passphrase never leaves the device.
//
// Honest limits: if the patient forgets the passphrase the note is gone, and the AI cannot read this
// field unless the patient decrypts it and chooses to send it. Use it for one field as an illustration
// of client-held keys, not as your whole data model.

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (u: Uint8Array): string => {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Tune the iteration count to your devices; higher is slower and harder to brute-force.
const PBKDF2_ITERATIONS = 600_000;

export interface ClientNotePayload {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 (includes the GCM auth tag)
  iter: number;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNote(note: string, passphrase: string): Promise<ClientNotePayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(note)),
  );
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iter: PBKDF2_ITERATIONS };
}

/** Throws if the passphrase is wrong or the payload was altered. */
export async function decryptNote(p: ClientNotePayload, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, fromB64(p.salt), p.iter);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(p.iv) }, key, fromB64(p.ct));
  return dec.decode(pt);
}
