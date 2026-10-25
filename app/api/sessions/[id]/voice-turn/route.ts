import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";

const execAsync = promisify(exec);

// Transcribe using OpenWhispr CLI (local mode)
async function transcribeAudio(audioPath: string, language: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `openwhispr transcribe "${audioPath}" --local --language ${language} --format json`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const result = JSON.parse(stdout);
    return result.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Transcription failed");
  }
}

// Translate using Ollama (local LLM)
async function translateText(text: string, _fromLang: string, toLang: string): Promise<string> {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral",
        prompt: `Translate the following text to ${toLang}. Only provide the translation, nothing else:\n\n"${text}"`,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    return (data.response || "").trim();
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Translation service unavailable");
  }
}

// Language code mapping for OpenWhispr
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const speaker = (formData.get("speaker") as string) || "doctor";
    const targetLanguage = (formData.get("targetLanguage") as string) || "en";

    if (!audioFile) {
      return NextResponse.json({ error: { message: "No audio file provided" } }, { status: 400 });
    }

    // Save audio to temp file
    const tmpDir = path.join(process.cwd(), ".voice-tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const audioPath = path.join(tmpDir, `${Date.now()}.wav`);

    const buffer = await audioFile.arrayBuffer();
    await fs.writeFile(audioPath, Buffer.from(buffer));

    try {
      // Transcribe
      const langCode = langCodes[targetLanguage] || "en";
      const originalText = await transcribeAudio(audioPath, langCode);

      if (!originalText) {
        return NextResponse.json({ error: { message: "No speech detected" } }, { status: 400 });
      }

      // Translate
      const translatedText = await translateText(originalText, "en", targetLanguage);

      return NextResponse.json({
        originalText,
        translatedText: translatedText || originalText,
        proposedUpdates: {},
      });
    } finally {
      // Clean up
      await fs.unlink(audioPath).catch(() => {});
    }
  } catch (error) {
    console.error("Voice turn error:", error);
    const message = error instanceof Error ? error.message : "Failed to process voice turn";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
