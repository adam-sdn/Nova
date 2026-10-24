// Run with:  npx tsx selftest.ts
import assert from "node:assert/strict";
import {
  appendAudit,
  breachView,
  decryptField,
  encryptField,
  generateMasterKeyBase64,
  loadMasterKey,
  pseudonymise,
  restore,
  verifyChain,
  type AuditEntry,
} from "./crypto";
import { decryptNote, encryptNote } from "./clientNote";

let passed = 0;
const check = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`PASS  ${name}`);
  });

const throwsAsync = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch {
    return true;
  }
  return false;
};

async function main() {
  const master = loadMasterKey(generateMasterKeyBase64());
  const note = "No childcare on Tuesdays; cannot travel before 10am.";
  const ctx = "appt-001:barrierNote";

  await check("encrypt/decrypt round-trip", () => {
    const enc = encryptField(note, master, ctx);
    assert.equal(decryptField(enc, master, ctx), note);
  });

  await check("same plaintext gives different ciphertext each time", () => {
    const a = encryptField(note, master, ctx);
    const b = encryptField(note, master, ctx);
    assert.notEqual(a.data.ct, b.data.ct);
  });

  await check("breach view does not reveal the plaintext", () => {
    const view = breachView(encryptField(note, master, ctx));
    assert.ok(!view.includes("childcare"));
  });

  await check("tampered ciphertext is rejected", () => {
    const enc = encryptField(note, master, ctx);
    const bytes = Buffer.from(enc.data.ct, "base64");
    bytes[0] ^= 0xff;
    enc.data.ct = bytes.toString("base64");
    assert.throws(() => decryptField(enc, master, ctx));
  });

  await check("ciphertext moved to another record is rejected", () => {
    const enc = encryptField(note, master, ctx);
    assert.throws(() => decryptField(enc, master, "appt-999:barrierNote"));
  });

  await check("wrong master key is rejected", () => {
    const enc = encryptField(note, master, ctx);
    const other = loadMasterKey(generateMasterKeyBase64());
    assert.throws(() => decryptField(enc, other, ctx));
  });

  await check("pseudonymise removes identifiers and restore puts them back", () => {
    const original =
      "Hi, I'm Maryam Ali. My number is 07123 456 789, NHS number 943 476 5919, " +
      "born 01/02/1980, email maryam@example.com. Maryam cannot come on Tuesday.";
    const { text, map } = pseudonymise(original, { name: "Maryam Ali" });
    for (const secret of ["Maryam", "Ali", "07123", "943 476", "1980", "example.com"]) {
      assert.ok(!text.includes(secret), `leaked: ${secret} in ${text}`);
    }
    assert.equal(restore(text, map), original);
  });

  await check("name matching respects word boundaries", () => {
    const { text } = pseudonymise("Ali and Alice arrived together.", { name: "Ali Hassan" });
    assert.ok(text.includes("Alice"), `Alice was corrupted: ${text}`);
    assert.ok(!text.startsWith("Ali "), `Ali was not removed: ${text}`);
  });

  await check("non-Latin (Arabic) names are pseudonymised and restored", () => {
    const original = "أنا مريم أحمد ولا أستطيع الحضور";
    const { text, map } = pseudonymise(original, { name: "مريم أحمد" });
    assert.ok(!text.includes("مريم") && !text.includes("أحمد"), text);
    assert.equal(restore(text, map), original);
  });

  await check("audit chain verifies, and detects edits and deletions", () => {
    const chain: AuditEntry[] = [];
    appendAudit(chain, { actor: "agent:translator", action: "translation.drafted", refId: "u1", detail: "draft text" });
    appendAudit(chain, { actor: "verifier:amira", action: "translation.verified", refId: "u1", detail: "final text" });
    appendAudit(chain, { actor: "agent:scribe", action: "visitpack.created", refId: "appt-001", detail: "pack" });
    assert.deepEqual(verifyChain(chain), { ok: true });

    const edited = structuredClone(chain);
    edited[1].actor = "verifier:someone-else";
    assert.deepEqual(verifyChain(edited), { ok: false, brokenAt: 1 });

    const shortened = structuredClone(chain);
    shortened.splice(1, 1);
    assert.equal(verifyChain(shortened).ok, false);
  });

  await check("client-side note: round-trip and wrong passphrase", async () => {
    const payload = await encryptNote("private diary entry", "correct horse battery");
    assert.equal(await decryptNote(payload, "correct horse battery"), "private diary entry");
    assert.ok(await throwsAsync(() => decryptNote(payload, "wrong passphrase")));
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
