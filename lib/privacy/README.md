# Privacy helpers for the hackathon prototype

Three small files, no dependencies (Node 18+). All 11 checks in `selftest.ts` pass.

| File | What it does |
|---|---|
| `crypto.ts` | Envelope encryption (AES-256-GCM), pseudonymisation before AI calls, hash-chained audit log |
| `clientNote.ts` | Optional browser-side "private note" (PBKDF2 + AES-GCM via Web Crypto) |
| `selftest.ts` | Run `npx tsx selftest.ts` to check everything works |

## Setup (2 minutes)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# put the output in .env.local as MASTER_KEY_BASE64=...   (never commit it, never store it in the database)
```

## Using it in a Next.js route handler

```ts
import { loadMasterKey, encryptField, decryptField, pseudonymise, restore, appendAudit } from "@/lib/privacy/crypto";

const master = loadMasterKey();

// 1. A patient reply arrives (already transcribed). Strip identifiers BEFORE any cloud AI call.
const { text: safeText, map } = pseudonymise(transcript, { name: patient.name, phone: patient.phone });
const analysis = await callBarrierAgent(safeText);        // your LLM call sees tokens, not identifiers

// 2. Store the sensitive note encrypted. `context` ties it to this record and field.
const encNote = encryptField(restore(analysis.note, map), master, `${appointmentId}:barrierNote`);
await db.save({ appointmentId, barrierTags: analysis.tags, barrierNote: encNote });   // tags are low-sensitivity

// 3. Audit it (hash only, no plaintext).
appendAudit(chain, { actor: "agent:barrier", action: "barrier.classified", refId: appointmentId, detail: analysis.note });

// 4. Later, a coordinator opens the record. Check their role first, then decrypt on the server.
if (user.role === "coordinator") note = decryptField(record.barrierNote, master, `${appointmentId}:barrierNote`);
```

## The "simulate breach" toggle

Show `breachView(record.barrierNote)` next to the decrypted view. That is what a database-only attacker sees.

## What you can honestly claim

- No raw audio is stored.
- Sensitive notes are encrypted at rest; the master key lives outside the database, so a database breach alone exposes ciphertext.
- Identifiers are replaced with tokens before text reaches AI services.
- The audit log is tamper-evident and holds hashes, not plaintext.

## What you cannot claim

- "Zero-knowledge": the server and AI APIs see plaintext transiently while processing.
- That memory is wiped: JavaScript cannot guarantee that.
- That speech-to-text providers never hear identifiers: pseudonymisation happens after transcription.
- That a hash chain stops a determined insider: anchor the latest hash somewhere the attacker cannot edit.

## Known limits

- Regex redaction is not foolproof. Over-redaction is the safe failure; test with your own transcripts.
- Some translation models alter tokens such as `[[NAME_1]]`. Test the round-trip, or avoid translating names.
- This is a prototype, not a security audit. Real patient data would need a DPIA and NHS information-governance assurance.
