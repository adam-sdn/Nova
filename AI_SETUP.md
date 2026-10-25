# AI providers: setup

With **MOCK_AI on** (the default), every AI step is an offline fixture labelled as mock. Switch it off on
`/demo` to use the real providers below. All calls go through `lib/ai.ts`, with names pseudonymised first.

| Step | Provider |
| --- | --- |
| Consultation translation | **MyMemory** (`api.mymemory.translated.net`), free machine translation. Text goes in the POST body, never the URL. |
| Back-translation (check 1) | **Gemini** (`gemini-2.5-flash`) |
| AI verifier (check 2) | **Gemma** (`gemma-3-27b-it`) through the same Gemini key |
| Patient summary, enquiry sorting, intake translation, Clinical Assessment draft, follow-ups, results pack | **Gemini** |

The three translation steps are three different model families, as CLAUDE.md rule 11 requires
(`data/config.json` → `translation`). The fixed safety rules run on every line as well.

If a translation service fails (offline, daily limit, bad reply), a doctor line is **held** and a patient line
**needs checking**, with the reason on the card. "Edit and recheck" tries again. Nothing is delivered without
passing the checks and the doctor's Send.

## Setup

1. Put your key in `.env.local` (never in code or git): `GEMINI_API_KEY=...`
   Vercel does not hand sensitive keys back, so the copy on Vercel cannot be pulled down; paste it yourself.
2. Optional: `MYMEMORY_EMAIL=you@example.com` raises MyMemory's free daily limit.
3. Restart the server (`npm run build` then `npm start`, or `npm run dev`).
4. On `/demo`, switch **MOCK_AI** off.

## Known limits

- MyMemory is machine translation plus a shared translation memory. In testing it translated English into
  Arabic and Spanish correctly, but returned "No, no, no…" for an Arabic sentence into English. The checks are
  there to catch this; treat patient lines marked "needs checking" with care.
- MyMemory is a third-party service: even pseudonymised, consultation text leaves the machine. Synthetic data only.
- `gemma-3-27b-it` and `gemini-2.5-flash` are the model ids at the time of writing; if Google retires one,
  change it in `data/config.json` (translation) or set `GEMINI_MODEL` (agents).
