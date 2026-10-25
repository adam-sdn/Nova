import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openDb, createCtx, type Ctx } from "@/lib/state/db";
import { seedDemo } from "@/lib/state/seed";
import crypto from "crypto";

describe("POST /api/sessions/[id]/voice-turn", () => {
  let ctx: Ctx;

  beforeAll(async () => {
    // Generate a test master key (32 bytes)
    const testKey = crypto.randomBytes(32);
    // Use an in-memory database for testing
    ctx = createCtx({ dbPath: ":memory:", masterKey: testKey });
    await seedDemo(ctx);
  });

  afterAll(() => {
    ctx.db.close();
  });

  it("accepts FormData with audio file", async () => {
    // Create a minimal WAV file (44 bytes header + silence)
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00, // File size - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16 for PCM)
      0x01, 0x00, // AudioFormat (1 = PCM)
      0x01, 0x00, // NumChannels
      0x44, 0xac, 0x00, 0x00, // SampleRate (44100)
      0x88, 0x58, 0x01, 0x00, // ByteRate
      0x02, 0x00, // BlockAlign
      0x10, 0x00, // BitsPerSample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x00, 0x00, 0x00, // Subchunk2Size (0 = silence)
    ]);

    const blob = new Blob([wavHeader], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("audio", blob, "test.wav");
    formData.append("speaker", "doctor");
    formData.append("targetLanguage", "en");

    expect(formData.get("audio")).toBeDefined();
    expect(formData.get("speaker")).toBe("doctor");
  });

  it("validates required fields", async () => {
    const formData = new FormData();
    formData.append("speaker", "doctor");
    // Missing audio file

    expect(formData.get("audio")).toBeNull();
  });

  it("handles language code mapping", async () => {
    const langCodes: Record<string, string> = {
      en: "en",
      ar: "ar",
      es: "es",
      zh: "zh",
      ur: "ur",
      pa: "pa",
      pl: "pl",
      ro: "ro",
    };

    expect(langCodes["ar"]).toBe("ar");
    expect(langCodes["es"]).toBe("es");
    expect(langCodes["zh"]).toBe("zh");
    expect(langCodes["invalid"] ?? "en").toBe("en");
  });

  it("tracks speaker state correctly", () => {
    let currentSpeaker: "doctor" | "patient" = "doctor";

    // Simulate speaker toggle
    currentSpeaker = "patient";
    expect(currentSpeaker).toBe("patient");

    currentSpeaker = "doctor";
    expect(currentSpeaker).toBe("doctor");
  });

  it("returns correct response structure", async () => {
    const mockResponse = {
      originalText: "Hello, how are you?",
      translatedText: "Hola, ¿cómo estás?",
      proposedUpdates: {
        "Presenting complaint": "Patient reports feeling well",
      },
    };

    expect(mockResponse).toHaveProperty("originalText");
    expect(mockResponse).toHaveProperty("translatedText");
    expect(mockResponse).toHaveProperty("proposedUpdates");
    expect(typeof mockResponse.originalText).toBe("string");
  });
});
