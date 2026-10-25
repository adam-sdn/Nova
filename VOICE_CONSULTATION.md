# Voice in the consultation, and Gemini

Voice exists only in the doctor's consultation screen (Session in progress). No other page records audio.

## How a turn works

1. The doctor holds **Hold to talk · Doctor** or **Hold to talk · Patient** while that person speaks.
   The microphone opens on press and closes on release. Presses under half a second are discarded.
2. The browser converts the recording to 16 kHz mono WAV and posts it to `POST /api/sessions/[id]/transcribe`
   (session's doctor only, session in progress). The server writes a temp file, runs
   `openwhispr --local transcribe <file> --language <speaker's language> --format json` (through `lib/ai.ts`),
   deletes the file and returns the text. Audio never goes to a cloud service; `--local` has no cloud fallback.
3. The text appears in an editable **Heard** box. The doctor corrects it (medicine names and doses in particular),
   then presses **Check translation**, or **Discard**. Nothing is sent without that click.
4. Check translation creates a normal message: the same translation checks, Send step and patient visibility rules
   as typed lines. The card shows the original and the translation. The Clinical Assessment draft updates from it.
5. Once a doctor line is delivered, **Play aloud** reads the translation with a voice installed on this computer.

Errors (microphone blocked, no microphone, no speech heard, OpenWhispr unreachable) show in the panel; a failed
transcription can be retried without recording again. **Pause microphone** disables both buttons. Typing works throughout.

## Manual setup

| What | How |
| --- | --- |
| OpenWhispr desktop app | Installed and running during the demo (it hosts the local models). |
| OpenWhispr CLI | `npm install -g @openwhispr/cli` (Node 20+). Check with `openwhispr doctor`: local must say reachable. |
| A usable speech model | Only `base` was downloaded, and it gets clinical speech badly wrong. In OpenWhispr, Settings → Transcription, download **turbo** (Whisper large-v3-turbo), then set `OPENWHISPR_MODEL=turbo` in `.env.local` and restart `npm run dev`. |
| Gemini key | Get a key from Google AI Studio, put `GEMINI_API_KEY=...` in `.env.local` (never in code or git), restart the dev server. Optional `GEMINI_MODEL` (default `gemini-2.5-flash`). |
| Use the real providers | On `/demo`, switch **MOCK_AI** off. With it on, everything is offline fixtures. |
| Play aloud voices | Windows Settings → Time & language → Speech → add voices for the patient languages. Without one, the button says so. |
| Microphone | Allow it for `localhost:3100` when the browser asks. |

## What uses which provider (MOCK_AI off)

| Task | Provider |
| --- | --- |
| Speech-to-text | OpenWhispr, local models only |
| Patient summary, enquiry sorting, intake translation, Clinical Assessment draft, follow-ups, results pack | Gemini (pseudonymised text) |
| Consultation translation, back-translation, verifier | Demo translation (labelled `[mock xx]`), chosen for speed. Set a `config.translation` model to `gemini:<model>` or `ollama:<model>` to make a step real; the three must stay different families. On this laptop's CPU, local Ollama models take 20 to 45 s per step, and Mistral mistranslated "5 mg amlodipine" as "5 ml amoxicillin" in testing. |

## Limits

- OpenWhispr's CLI reaches the desktop app through its local bridge (127.0.0.1:8200), which is not a documented public API; an app update could change it. If it breaks, typing still works.
- Whisper quality for Punjabi and Urdu is weaker than for the other languages. The review step is there for this.
- Speech cannot be pseudonymised, which is why only a local speech provider is allowed.
