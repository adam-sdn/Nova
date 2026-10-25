# OpenWhispr Voice Consultation Implementation

## Summary

The OpenWhispr voice consultation feature has been fully implemented and integrated into the Nova Systems doctor consultation interface. The feature enables real-time speech-to-text capture, translation, and field proposal generation during patient consultations.

## What Was Built

### 1. Core Components
- **`lib/hooks/useVoiceConsultation.ts`** — React hook managing:
  - Recording state (idle, recording, processing, ready, playing, error)
  - Conversation history (original + translated transcripts)
  - Speaker tracking (doctor / patient)
  - Audio capture using browser getUserMedia API
  - WAV file encoding (no additional dependencies)

- **`components/doctor/VoiceConsultation.tsx`** — UI component with:
  - Hold-to-talk buttons for doctor and patient
  - Recording state indicators
  - Transcript display (original language + translated)
  - Conversation history labelled by speaker
  - Doctor review panel for proposed note updates
  - TTS playback button
  - Discard/retry controls

- **`app/api/sessions/[id]/voice-turn/route.ts`** — Backend API that:
  - Receives WAV audio from browser
  - Calls `openwhispr transcribe --local` via CLI
  - Translates using Ollama (localhost:11434)
  - Returns structured response (transcript, translation, proposed updates)
  - Cleans up temporary files
  - Error handling with helpful messages

### 2. Integration
- Added to `Session.tsx` InSession component (consultation area only)
- No changes to dashboard, patient directory, nurse board, or navigation
- Seamlessly replaces the typed-input fallback
- Type-safe throughout (TypeScript strict mode)

### 3. Architecture Decisions
- **Local-first privacy**: All audio processing stays on-device (OpenWhispr desktop app)
- **No additional dependencies**: WAV encoding via browser AudioContext
- **Graceful degradation**: Falls back to typed input if voice fails
- **Doctor review required**: No auto-save or auto-sign of notes
- **Modular design**: Single API route, isolated hook, standalone component

## Testing

### Unit Tests ✅
All 5 tests pass:
```bash
npm test -- tests/voice-turn.test.ts
```
Tests cover:
- FormData validation
- Required fields
- Language code mapping
- Speaker state
- Response structure validation

### Manual Test Setup

**Quick Start:**
1. Ensure OpenWhispr is running and Mistral model is downloaded:
   ```bash
   ollama list  # Should show mistral
   ```

2. Go to demo page and seed the database:
   ```
   http://localhost:3100/demo
   Click: Reset and Seed
   ```

3. Join a session as doctor (D-01):
   ```
   Go to http://localhost:3100/doctor
   Session code from nurse board (usually 34FDHU in demo)
   ```

4. Patient ready for consultation should appear in "Ready to be consulted" queue

5. Click patient to open InSession view → scroll to "Voice Input" section

**Alternative Setup (direct database):**
```javascript
// In browser console while on /demo:
const response = await fetch('/api/demo/setup-consultation', { method: 'POST' });
const data = await response.json();
console.log(data); // Shows patient ID and status
```

This endpoint transitions any non-done patient to "consultation" status, ready for voice input.

## Feature Behavior

### Recording Flow
1. User selects **Doctor** or **Patient** (demo mode)
2. Clicks **Hold to record**
3. Browser requests microphone permission (first time only)
4. Records while button is held, stops on release
5. Shows **Recording…** state during processing

### Processing Flow
1. Audio → WAV encoding in browser
2. POST to `/api/sessions/[id]/voice-turn`
3. OpenWhispr transcribes locally (via desktop app bridge)
4. Ollama translates via mistral model
5. Returns: `originalText`, `translatedText`, `proposedUpdates`

### Review & Acceptance
1. Doctor sees both transcript versions side-by-side
2. Proposed note field updates shown
3. Three actions: **Add to conversation** / **Discard** / **Play back**
4. Accepted turn appears in conversation history
5. Conversation state carries through to Clinical Assessment form

### Conversation History
Each turn shows:
- Speaker (Doctor / Patient)
- Turn number
- Timestamp
- Original text + translated text
- All turns persist in session

## Configuration & Dependencies

### Required (User's Machine)
- OpenWhispr desktop app running
- Mistral model downloaded (4.4 GB)
- Ollama running on localhost:11434
- Browser microphone access allowed

### Optional
- Windows TTS voices for playback (user requested: Spanish, Arabic, Chinese, Urdu, Punjabi, Polish, Romanian)
- Install via **Settings → Time & Language → Speech**

### No New NPM Dependencies
- Uses browser APIs: `getUserMedia`, `MediaRecorder`, `AudioContext`
- Existing Ollama integration (local LLM)
- Existing OpenWhispr CLI (system command)

## What's NOT Implemented (Out of Scope)

- ❌ Voice-to-text on nurse board, patient directory, navigation
- ❌ Continuous background recording (only hold-to-talk)
- ❌ Cloud transcription fallback (local-only by design)
- ❌ Speech synthesis for doctor's responses (patient receives translated text)
- ❌ Automatic note field updates (doctor reviews before save)
- ❌ Real-time speaker detection (doctor/patient manually selected)

## Known Limitations

1. **OpenWhispr CLI stability**: The desktop app's "loopback bridge" (port 8200) is undocumented as a public interface. Future OpenWhispr updates could break it. Mitigation: Single adapter in API route, falls back to typed input on failure.

2. **Language code coverage**: OpenWhispr docs don't confirm coverage for all requested languages in local Whisper models. Parakeet v3 supports 25 unnamed languages. Recommend using Whisper small/turbo for Arabic and Polish.

3. **TTS voice availability**: Playback depends on Windows voice packs. If language voices aren't installed, button exists but produces no sound (not an error, just silent).

4. **Ollama model selection**: Currently hardcoded to `mistral`. For better quality or faster speed, change in `voice-turn/route.ts` line where it calls `fetch(...model: "mistral"...)`

5. **Single patient per consultation**: No multi-party consultation tracking. Each hold-to-talk records one turn from one speaker.

## Files Added/Modified

### New Files
- `lib/hooks/useVoiceConsultation.ts` (250 lines)
- `components/doctor/VoiceConsultation.tsx` (180 lines)
- `app/api/sessions/[id]/voice-turn/route.ts` (75 lines)
- `app/api/demo/setup-consultation/route.ts` (35 lines)
- `tests/voice-turn.test.ts` (95 lines)
- `VOICE_CONSULTATION.md` (this file)

### Modified Files
- `components/doctor/Session.tsx` — Import + render VoiceConsultation in InSession
- `lib/hooks/` (directory created)
- `app/api/demo/` (directory created)

## Next Steps

1. **Install TTS voices** (optional, for playback):
   ```
   Windows Settings → Time & Language → Speech → Add voices
   Select: Spanish, Arabic, Chinese, Urdu, Punjabi, Polish, Romanian
   ```

2. **Configure Ollama model** (if not using Mistral):
   Edit `app/api/sessions/[id]/voice-turn/route.ts` line ~60:
   ```typescript
   model: "mistral", // Change to another model if desired
   ```

3. **Test patient flow**:
   - Seed database
   - Join session as doctor
   - Click patient in "Ready to be consulted"
   - Hold "Record" button and speak
   - Review transcript and translation
   - Accept or discard turn

4. **Monitor browser console** for:
   - Microphone permission prompts
   - Network errors (if Ollama is down)
   - Audio encoding issues

## Verification Checklist

- ✅ TypeScript: `npm run typecheck` passes
- ✅ Unit tests: `npm test -- tests/voice-turn.test.ts` (5/5 pass)
- ✅ Integration: API route accepts FormData and returns JSON
- ✅ Dev server: No errors on `/doctor` InSession view
- ✅ OpenWhispr bridge: `openwhispr doctor` confirms local:11434 reachable
- ✅ Ollama running: mistral model available
- ⏳ E2E: Hold-to-talk records → transcribe → translate → review flow (pending full patient setup)

## Privacy & Security

As required by CLAUDE.md:
- ✅ No API keys in code
- ✅ Audio never leaves the machine (OpenWhispr local only)
- ✅ No patient data sent to cloud services
- ✅ Transcripts stored in session memory only (no database persistence)
- ✅ Temp audio files deleted immediately after processing
- ✅ No automatic note signing or finalization
- ✅ Doctor review required before any data is committed

## Support

If voice input fails:
1. Check OpenWhispr is running: `openwhispr doctor`
2. Check Ollama is running: `curl http://localhost:11434/api/tags`
3. Check browser console for specific errors
4. Microphone permission dialog — allow on first prompt
5. Fall back to typed input (always available)

---

**Status**: Ready for testing. Core feature complete and unit-tested. Manual testing requires patient setup through demo seed or setup endpoint.

**Last Updated**: 2026-10-25
