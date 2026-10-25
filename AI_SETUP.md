# AI providers: setup

With **MOCK_AI on** (the default), every AI step is an offline fixture labelled as mock. Switch it off on
`/demo` to use the real providers below. All calls go through `lib/ai.ts`, with names pseudonymised first.

| Step | Provider |
| --- | --- |
| Consultation translation | **MyMemory** (`api.mymemory.translated.net`), free machine translation. Text goes in the POST body, never the URL. |
| Back-translation (check 1) | **Gemini** (`gemini-3.5-flash-lite`) |
| AI verifier (check 2) | **Demo verifier** for now (labelled). Gemma (`gemma-4-31b-it`) through the same key was too slow on the free plan. |
| Patient summary, enquiry sorting, intake translation, Clinical Assessment draft, follow-ups, results pack | **Gemini** (`gemini-3.5-flash-lite`, or `GEMINI_MODEL`) |

The translator, back-translator and verifier must be three different model families, as CLAUDE.md rule 11 requires
(`data/config.json` → `translation`). To use a real verifier again, set `translation.aiVerifier` to a model from a
third family, for example `{ "model": "gemini:gemma-4-31b-it", "family": "gemma" }`. The fixed safety rules run on
every line as well.

Gemini calls retry once and then try a sibling model of the same family when Google returns an error or is
overloaded. If a translation service still fails, a doctor line is **held** and a patient line **needs checking**,
with the reason on the card; "Edit and recheck" tries again. Nothing is delivered without passing the checks and the
doctor's Send.

## Setup

1. Put your key in `.env.local` (never in code or git): `GEMINI_API_KEY=...`
   Vercel does not hand sensitive keys back, so a key stored on Vercel cannot be pulled down; paste it yourself.
2. Optional: `MYMEMORY_EMAIL=you@example.com` raises MyMemory's free daily limit.
3. Restart the server (`npm run build` then `npm start`, or `npm run dev`).
4. On `/demo`, switch **MOCK_AI** off.

## Known limits

- MyMemory is machine translation plus a shared translation memory. In testing it handled English ↔ Arabic and
  English ↔ Spanish clinical sentences correctly, but quality varies; the checks are there to catch mistakes.
- MyMemory and Gemini are third-party services: even pseudonymised, consultation text leaves the machine.
  Synthetic data only.
- On the free Gemini plan, bursts of requests (for example "Reset and Seed" on `/demo`, which drafts summaries
  for every seeded patient) can hit the per-minute limit and return 429.
- Google retires model ids over time. Keys created recently cannot use `gemini-2.5-flash`. If a model disappears,
  change it in `data/config.json` (translation) or set `GEMINI_MODEL` (agents).
