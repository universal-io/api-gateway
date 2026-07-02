// Screenshot interpretation via the OpenAI Responses API. Server-side port of
// the macOS OpenAIVisionClient (BombSquad/Services/OpenAIVisionClient.swift);
// keep the prompt and fallback behavior in sync until the BYOK fallback path
// is removed. The result JSON is passed through to the client, which decodes
// it flexibly (VisionInterpretationResult.decodeFlexible).

import { getServerEnv } from "@/lib/server/env";
import { ProviderCallError } from "@/lib/server/review-engine";
import type { OutputLanguageCode } from "@/lib/server/prompts";

const ENDPOINT = "https://api.openai.com/v1/responses";
const FALLBACK_MODEL = "gpt-4.1-mini";

const LANGUAGE_PROMPT_NAMES: Record<OutputLanguageCode, string> = {
  japanese: "日本語",
  english: "英語",
};

export type VisionEngineInput = {
  imageDataURL: string;
  instruction?: string;
  language: OutputLanguageCode;
};

export type VisionEngineOutput = {
  // Interpretation JSON as produced by the model (summary, visible_text,
  // interpretation, suggested_actions, uncertainties).
  result: Record<string, unknown>;
  modelVendor: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export async function runVisionInterpretation(
  input: VisionEngineInput,
): Promise<VisionEngineOutput> {
  const env = getServerEnv();
  if (!env.openaiApiKey) {
    throw new ProviderCallError('No provider key configured for vendor "openai".');
  }

  const models = [env.visionModelId];
  if (!models.includes(FALLBACK_MODEL)) {
    models.push(FALLBACK_MODEL);
  }

  let lastError: ProviderCallError | null = null;
  for (const model of models) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody(model, input)),
    });

    if (response.status === 429) {
      throw new ProviderCallError(
        "AI エンジンが混雑しています。数秒おいてから再試行してください。",
        { rateLimited: true },
      );
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      lastError = new ProviderCallError(`Provider HTTP ${response.status}: ${detail}`);
      // Unknown/rejected model id: try the fallback model once.
      if ((response.status === 400 || response.status === 404) && model !== models[models.length - 1]) {
        continue;
      }
      throw lastError;
    }

    const root = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = outputText(root);
    const json = text ? extractJSON(text) : null;
    if (!json) {
      throw new ProviderCallError("Provider response contained no JSON object.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new ProviderCallError("Provider response JSON failed to parse.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ProviderCallError("Provider response JSON was not an object.");
    }

    return {
      result: parsed as Record<string, unknown>,
      modelVendor: "openai",
      modelId: model,
      inputTokens: root.usage?.input_tokens ?? 0,
      outputTokens: root.usage?.output_tokens ?? 0,
    };
  }

  throw lastError ?? new ProviderCallError("Vision interpretation failed.");
}

function requestBody(model: string, input: VisionEngineInput): Record<string, unknown> {
  const instruction = input.instruction?.trim();
  const task = instruction
    ? instruction
    : "このスクリーンショットを読み取り、ユーザーが次に何をすればよいか分かるように説明してください。";

  return {
    model,
    max_output_tokens: 2048,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: systemPrompt(input.language) }],
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: task },
          { type: "input_image", image_url: input.imageDataURL, detail: "auto" },
        ],
      },
    ],
  };
}

function systemPrompt(language: OutputLanguageCode): string {
  return `You help the user understand the current computer screen.
Describe only what can be inferred from the screenshot.
Extract important visible text.
Explain the likely meaning for a non-expert user.
List concrete next actions.
Call out uncertainty instead of guessing.
Return exactly one JSON object. Do not wrap it in Markdown.
The JSON keys must be: summary, visible_text, interpretation, suggested_actions, uncertainties.
All values must be written in ${LANGUAGE_PROMPT_NAMES[language]}.`;
}

function outputText(root: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string | null {
  if (typeof root.output_text === "string") {
    return root.output_text;
  }
  for (const item of root.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }
  return null;
}

function extractJSON(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  return raw.slice(start, end + 1);
}
