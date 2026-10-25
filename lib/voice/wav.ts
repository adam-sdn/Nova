// Recorded speech -> 16 kHz mono 16-bit WAV, the format local speech models expect.
// The browser records Opus/WebM; this keeps the server free of ffmpeg and the CLI free of format guessing.

export const SPEECH_SAMPLE_RATE = 16_000;

/** Mono 16-bit PCM WAV from samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Browser only: decode a MediaRecorder blob, mix to mono and resample to 16 kHz, then wrap as WAV. */
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const decodeCtx = new AudioContext();
  try {
    const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, SPEECH_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), SPEECH_SAMPLE_RATE)], { type: "audio/wav" });
  } finally {
    void decodeCtx.close();
  }
}
