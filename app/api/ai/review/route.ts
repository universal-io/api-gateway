// AI gateway: POST /api/ai/review (docs/api-contract.md is the contract).
// Flow: verify Supabase JWT -> resolve tenant -> check entitlement/quota ->
// call provider -> record usage event -> return result + quota envelope.

import { getServerEnv } from "@/lib/server/env";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  authenticate,
  currentMonthStartUTC,
  errorResponse,
  gatewayErrorResponse,
  GatewayError,
  nextMonthStartUTC,
  recordUsage,
} from "@/lib/server/gateway";
import {
  ProviderCallError,
  runReview,
  type ReviewResultPayload,
} from "@/lib/server/review-engine";
import type {
  MemoryPayload,
  OutputLanguageCode,
  ReviewMode,
  SituationalContextPayload,
} from "@/lib/server/prompts";

type ReviewRequestBody = {
  request_id?: string;
  operation?: string;
  mode?: string;
  input?: {
    draft?: string;
    context?: SituationalContextPayload;
    memory?: MemoryPayload;
  };
  preferences?: {
    output_language?: string;
    model_preference?: { vendor?: string; model_id?: string };
  };
  client?: {
    platform?: string;
    app_version?: string;
    build_number?: string;
    device_id?: string;
  };
};

type QuotaInfo = {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
  resets_at: string;
};

export async function POST(request: Request): Promise<Response> {
  let requestId: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as ReviewRequestBody | null;
    if (!body) {
      return errorResponse(400, "BAD_REQUEST", "Request body must be JSON.", null);
    }
    requestId = typeof body.request_id === "string" ? body.request_id : null;

    // --- Validation (contract: BAD_REQUEST) ---
    const draft = body.input?.draft?.trim();
    const mode = body.mode;
    const language = body.preferences?.output_language;
    const platform = body.client?.platform;
    if (!requestId) {
      return errorResponse(400, "BAD_REQUEST", "request_id is required.", requestId);
    }
    if (body.operation !== "review") {
      return errorResponse(400, "BAD_REQUEST", "operation must be 'review'.", requestId);
    }
    if (mode !== "compose" && mode !== "transform") {
      return errorResponse(400, "BAD_REQUEST", "mode must be 'compose' or 'transform'.", requestId);
    }
    if (!draft) {
      return errorResponse(400, "BAD_REQUEST", "input.draft must not be empty.", requestId);
    }
    if (language !== "japanese" && language !== "english") {
      return errorResponse(400, "BAD_REQUEST", "preferences.output_language must be 'japanese' or 'english'.", requestId);
    }
    if (platform !== "macos" && platform !== "ios" && platform !== "android" && platform !== "web") {
      return errorResponse(400, "BAD_REQUEST", "client.platform is required.", requestId);
    }

    // --- Authentication / tenant / entitlement ---
    const { userId, tenantId, entitlement } = await authenticate(request);

    // --- Quota ---
    const env = getServerEnv();
    const limit = entitlement.monthly_review_limit ?? env.freeMonthlyReviewLimit;
    const periodStart = currentMonthStartUTC();
    const admin = getSupabaseAdminClient();
    const { count } = await admin
      .from("bs_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("operation", "review")
      .eq("status", "success")
      .gte("created_at", periodStart.toISOString());
    const used = count ?? 0;

    const quota = (usedNow: number): QuotaInfo => ({
      plan: entitlement.plan,
      used: usedNow,
      limit,
      remaining: Math.max(0, limit - usedNow),
      resets_at: nextMonthStartUTC().toISOString(),
    });

    if (used >= limit) {
      return errorResponse(429, "QUOTA_EXCEEDED", "Monthly review limit reached.", requestId, quota(used));
    }

    // --- Provider call ---
    const started = Date.now();
    let engineOutput;
    try {
      engineOutput = await runReview({
        mode: mode as ReviewMode,
        draft,
        language: language as OutputLanguageCode,
        context: body.input?.context,
        memory: body.input?.memory,
        preferredVendor: body.preferences?.model_preference?.vendor,
        preferredModelId: body.preferences?.model_preference?.model_id,
      });
    } catch (error) {
      // User-facing message: pass the rate-limit guidance through, keep raw
      // upstream details in the server log only.
      const rateLimited = error instanceof ProviderCallError && error.rateLimited;
      const message = rateLimited
        ? (error as ProviderCallError).message
        : "AI エンジン側で一時的なエラーが発生しました。少し待ってから再試行してください。";
      const detail = error instanceof ProviderCallError ? error.message : String(error);
      console.error(`[/api/ai/review] provider error (request ${requestId}):`, detail);
      await recordUsage(tenantId, userId, {
        operation: "review",
        unitType: "review",
        requestId,
        status: "error",
        errorCode: "PROVIDER_ERROR",
        latencyMs: Date.now() - started,
        metadata: usageMetadata(body),
      });
      return errorResponse(502, "PROVIDER_ERROR", message, requestId);
    }
    const latencyMs = Date.now() - started;

    await recordUsage(tenantId, userId, {
      operation: "review",
      unitType: "review",
      requestId,
      status: "success",
      modelVendor: engineOutput.modelVendor,
      modelId: engineOutput.modelId,
      inputUnits: engineOutput.inputTokens,
      outputUnits: engineOutput.outputTokens,
      latencyMs,
      metadata: usageMetadata(body),
    });

    return Response.json({
      request_id: requestId,
      result: engineOutput.result satisfies ReviewResultPayload,
      meta: {
        mode,
        output_language: language,
        model_vendor: engineOutput.modelVendor,
        model_id: engineOutput.modelId,
        latency_ms: latencyMs,
      },
      quota: quota(used + 1),
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      return gatewayErrorResponse(error, requestId);
    }
    console.error("[/api/ai/review] internal error:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unclassified server failure.", requestId);
  }
}

function usageMetadata(body: ReviewRequestBody): Record<string, unknown> {
  return {
    mode: body.mode,
    output_language: body.preferences?.output_language,
    platform: body.client?.platform,
    app_version: body.client?.app_version,
    has_context: Boolean(body.input?.context?.conversation_excerpt),
    has_memory: Boolean(body.input?.memory?.persona_md || body.input?.memory?.relationship_md),
  };
}
