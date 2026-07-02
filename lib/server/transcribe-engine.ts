// Groq Whisper proxy for the AI gateway. Port of the macOS GroqTranscriber
// (BombSquad/Services/GroqTranscriber.swift) including its hallucination
// filter; keep the two in sync until the BYOK fallback path is removed.

import { getServerEnv } from "@/lib/server/env";
import { ProviderCallError } from "@/lib/server/review-engine";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL_ID = "whisper-large-v3";

export type TranscriptionOutput = {
  text: string;
  modelVendor: string;
  modelId: string;
  durationSeconds: number;
};

type WhisperSegment = {
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

export async function runTranscription(audio: File): Promise<TranscriptionOutput> {
  const env = getServerEnv();
  if (!env.groqApiKey) {
    throw new ProviderCallError('No provider key configured for vendor "groq".');
  }

  const form = new FormData();
  form.append("model", MODEL_ID);
  form.append("temperature", "0");
  // verbose_json gives per-segment confidence used to filter hallucinations.
  form.append("response_format", "verbose_json");
  form.append("file", audio, audio.name || "audio.m4a");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.groqApiKey}` },
    body: form,
  });

  if (response.status === 429) {
    throw new ProviderCallError(
      "AI エンジンが混雑しています。数秒おいてから再試行してください。",
      { rateLimited: true },
    );
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ProviderCallError(`Provider HTTP ${response.status}: ${detail}`);
  }

  const root = (await response.json()) as {
    text?: string;
    duration?: number;
    segments?: WhisperSegment[];
  };

  // Drop segments that look like silence-driven hallucinations, then rebuild
  // the text from what's left. Fall back to the top-level text otherwise.
  let text: string;
  if (Array.isArray(root.segments)) {
    text = root.segments
      .filter((segment) => !isHallucinated(segment))
      .map((segment) => segment.text ?? "")
      .join("")
      .trim();
  } else if (typeof root.text === "string") {
    text = root.text.trim();
  } else {
    throw new ProviderCallError("Transcription response had no text.");
  }

  return {
    text,
    modelVendor: "groq",
    modelId: MODEL_ID,
    durationSeconds: typeof root.duration === "number" ? root.duration : 0,
  };
}

/**
 * Whisper's own silence heuristic plus a repetition guard. A segment is
 * treated as a hallucination when the model is both confident there is no
 * speech and uncertain about its tokens, or when the output is degenerate
 * (highly repetitive text compresses far more than natural language).
 */
function isHallucinated(segment: WhisperSegment): boolean {
  const noSpeechProb = segment.no_speech_prob ?? 0;
  const avgLogprob = segment.avg_logprob ?? 0;
  const compressionRatio = segment.compression_ratio ?? 0;
  if (noSpeechProb > 0.6 && avgLogprob < -1.0) return true;
  if (compressionRatio > 2.4) return true;
  return false;
}
