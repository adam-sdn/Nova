/** Languages the consultation can transcribe (Whisper language codes). Shared by the browser and the server. */
export const SPEECH_LANGUAGES = ["en", "ar", "es", "zh", "ur", "pa", "pl", "ro"] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];
