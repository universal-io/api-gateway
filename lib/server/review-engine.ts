// Provider execution for the AI gateway. v1 routes everything to an
// OpenAI-compatible endpoint (Groq by default, OpenAI as a secondary vendor);
// Anthropic lands with model routing in a later phase.

import { getServerEnv } from "@/lib/server/env";
import {
  enrichedSystem,
  userContent,
  JSON_INSTRUCTION,
  type MemoryPayload,
  type OutputLanguageCode,
  type ReviewMode,
  type SituationalContextPayload,
} from "@/lib/server/prompts";

export type ReviewIssue = {
  category: "typo" | "impoliteness" | "unclear";
  severity: "low" | "medium" | "high";
  excerpt: string;
  explanation: string;
  suggestion: string;
};

export type ReviewResultPayload = {
  issues: ReviewIssue[];
  revised_text: string;
  summary: string;
};

export type ReviewEngineOutput = {
  result: ReviewResultPayload;
  modelVendor: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export class ProviderCallError extends Error {
  readonly rateLimited: boolean;

  constructor(message: string, options?: { rateLimited?: boolean }) {
    super(message);
    this.name = "ProviderCallError";
    this.rateLimited = options?.rateLimited ?? false;
  }
}

type EngineInput = {
  mode: ReviewMode;
  draft: string;
  language: OutputLanguageCode;
  context?: SituationalContextPayload;
  memory?: MemoryPayload;
  preferredVendor?: string;
  preferredModelId?: string;
};

const VENDOR_ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

export async function runReview(input: EngineInput): Promise<ReviewEngineOutput> {
  const env = getServerEnv();

  // Model preference is advisory (docs/api-contract.md); only vendors the
  // gateway actually has keys for are honored, otherwise fall back to default.
  let vendor = input.preferredVendor ?? env.defaultModelVendor;
  let modelId = input.preferredModelId ?? env.defaultModelId;
  if (!apiKeyFor(vendor)) {
    vendor = env.defaultModelVendor;
    modelId = env.defaultModelId;
  }
  const apiKey = apiKeyFor(vendor);
  const endpoint = VENDOR_ENDPOINTS[vendor];
  if (!apiKey || !endpoint) {
    throw new ProviderCallError(`No provider key configured for vendor "${vendor}".`);
  }

  const system = enrichedSystem(input.mode, input.memory);
  const user =
    userContent(input.mode, input.draft, input.language, input.context) +
    "\n\n" +
    JSON_INSTRUCTION;

  const body: Record<string, unknown> = {
    model: modelId,
    // 2048 is plenty for a review result, and on Groq the reservation counts
    // toward the tokens-per-minute limit — 4096 made a single context-heavy
    // review eat half the free-tier minute budget.
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (vendor === "groq" && modelId.includes("gpt-oss")) {
    body.reasoning_effort = "medium";
  }

  let response = await callProvider(endpoint, apiKey, body);

  // One retry on upstream rate limits, honoring the suggested wait when the
  // provider announces it (Groq puts "try again in Xs" in the error body).
  if (response.status === 429) {
    const detail = await response.text();
    const waitMs = suggestedWaitMs(response, detail);
    await sleep(Math.min(waitMs, 6500));
    response = await callProvider(endpoint, apiKey, body);
    if (response.status === 429) {
      throw new ProviderCallError(
        "AI エンジンが混雑しています。数秒おいてから再試行してください。",
        { rateLimited: true },
      );
    }
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new ProviderCallError(`Provider HTTP ${response.status}: ${detail}`);
  }

  const root = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; refusal?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const message = root.choices?.[0]?.message;
  if (message?.refusal) {
    throw new ProviderCallError(`Model refused: ${message.refusal}`);
  }
  const content = message?.content;
  if (!content) {
    throw new ProviderCallError("Provider returned no content.");
  }

  const result = parseResult(content);
  return {
    result,
    modelVendor: vendor,
    modelId,
    inputTokens: root.usage?.prompt_tokens ?? 0,
    outputTokens: root.usage?.completion_tokens ?? 0,
  };
}

function callProvider(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function suggestedWaitMs(response: Response, detail: string): number {
  const retryAfter = Number.parseFloat(response.headers.get("retry-after") ?? "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  const match = detail.match(/try again in ([\d.]+)s/i);
  if (match) {
    return Number.parseFloat(match[1]) * 1000 + 500;
  }
  return 3000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiKeyFor(vendor: string): string | null {
  const env = getServerEnv();
  switch (vendor) {
    case "groq":
      return env.groqApiKey;
    case "openai":
      return env.openaiApiKey;
    default:
      return null;
  }
}

/** Tolerates reasoning blocks, code fences, or stray prose around the JSON. */
function parseResult(raw: string): ReviewResultPayload {
  let text = raw;
  const thinkEnd = text.lastIndexOf("</think>");
  if (thinkEnd >= 0) {
    text = text.slice(thinkEnd + "</think>".length);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new ProviderCallError("Provider response contained no JSON object.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ProviderCallError("Provider response JSON failed to parse.");
  }

  const candidate = parsed as Partial<ReviewResultPayload>;
  if (typeof candidate.revised_text !== "string" || typeof candidate.summary !== "string") {
    throw new ProviderCallError("Provider response JSON missing required fields.");
  }
  const issues = Array.isArray(candidate.issues)
    ? candidate.issues.filter(isValidIssue)
    : [];
  return {
    issues,
    revised_text: candidate.revised_text,
    summary: candidate.summary,
  };
}

function isValidIssue(value: unknown): value is ReviewIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  return (
    (issue.category === "typo" ||
      issue.category === "impoliteness" ||
      issue.category === "unclear") &&
    (issue.severity === "low" || issue.severity === "medium" || issue.severity === "high") &&
    typeof issue.excerpt === "string" &&
    typeof issue.explanation === "string" &&
    typeof issue.suggestion === "string"
  );
}
