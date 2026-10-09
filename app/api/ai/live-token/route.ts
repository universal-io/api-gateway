import {
  authenticateAIRequest,
  enforceQuota,
  errorResponse,
  gatewayErrorResponse,
  GatewayError,
  recordUsageAfterResponse,
  warmAIRequest,
} from "@/lib/server/gateway";
import { getServerEnv } from "@/lib/server/env";
import { LIVE_MODEL } from "@/lib/server/ai-routing";
import {
  liveSetup,
  mintLiveToken,
  parseLiveLook,
  parseLiveTurns,
  parseLiveVoice,
} from "@/lib/server/live-session";

// R18 voice companion (experiment). Mints a single-use Gemini Live token with
// the whole session setup locked in, and returns that setup for the client to
// send verbatim. The key never leaves this process; the client talks to the
// Live API directly because a serverless route cannot hold a WebSocket.

const MAX_HANDLE_CHARS = 4_096;

type LiveTokenRequestBody = {
  request_id?: string;
  operation?: string;
  input?: { handle?: unknown; voice?: unknown; turns?: unknown; look?: unknown };
  client?: { platform?: string; app_version?: string };
};

export const maxDuration = 60;

export const GET = warmAIRequest;

export async function POST(request: Request): Promise<Response> {
  let requestId: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as LiveTokenRequestBody | null;
    if (!body) {
      return errorResponse(400, "BAD_REQUEST", "Request body must be JSON.", null);
    }
    requestId = typeof body.request_id === "string" ? body.request_id : null;
    if (!requestId) {
      return errorResponse(400, "BAD_REQUEST", "request_id is required.", null);
    }
    if (body.operation !== "live_token") {
      return errorResponse(400, "BAD_REQUEST", "operation must be 'live_token'.", requestId);
    }
    const platform = body.client?.platform;
    if (platform !== "macos" && platform !== "ios" && platform !== "android" && platform !== "web") {
      return errorResponse(400, "BAD_REQUEST", "client.platform is required.", requestId);
    }
    const rawHandle = body.input?.handle;
    if (rawHandle !== undefined
      && (typeof rawHandle !== "string" || !rawHandle || rawHandle.length > MAX_HANDLE_CHARS)) {
      return errorResponse(400, "BAD_REQUEST", "input.handle is invalid.", requestId);
    }
    const handle = rawHandle as string | undefined;
    const voice = parseLiveVoice(body.input?.voice);
    if (!voice) {
      return errorResponse(400, "BAD_REQUEST", "input.voice is not a known voice.", requestId);
    }
    // Build 19 sends no turns and keeps the server's activity detection.
    const turns = parseLiveTurns(body.input?.turns);
    if (!turns) {
      return errorResponse(400, "BAD_REQUEST", "input.turns must be 'server' or 'client'.", requestId);
    }
    // Builds up to 24 send no look and keep the synchronous answer.
    const look = parseLiveLook(body.input?.look);
    if (!look) {
      return errorResponse(400, "BAD_REQUEST", "input.look must be 'sync' or 'async'.", requestId);
    }

    const { userId, tenantId, entitlement } = await authenticateAIRequest(request);
    // One session is one unit. A resume continues the same conversation, so it
    // neither checks nor spends the quota; it still needs a signed-in user.
    const resumed = Boolean(handle);
    if (!resumed) await enforceQuota(tenantId, entitlement);

    const apiKey = getServerEnv().geminiApiKey;
    if (!apiKey) {
      return errorResponse(503, "PROVIDER_ERROR", "Live API is not configured on the server.", requestId);
    }

    const setup = liveSetup({ voice, handle, turns, look });
    const started = Date.now();
    try {
      const minted = await mintLiveToken(apiKey, setup, started);
      const latencyMs = Date.now() - started;
      if (!resumed) {
        recordUsageAfterResponse(tenantId, userId, {
          operation: "live",
          unitType: "session",
          requestId,
          status: "success",
          modelVendor: LIVE_MODEL.vendor,
          modelId: LIVE_MODEL.modelId,
          latencyMs,
          metadata: { platform, app_version: body.client?.app_version, voice },
        });
      }
      return Response.json(
        {
          request_id: requestId,
          result: {
            token: minted.token,
            setup,
            expires_at: minted.expiresAt,
            new_session_expires_at: minted.newSessionExpiresAt,
            resumed,
          },
          meta: {
            model_vendor: LIVE_MODEL.vendor,
            model_id: LIVE_MODEL.modelId,
            latency_ms: latencyMs,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const latencyMs = Date.now() - started;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[/api/ai/live-token] mint failed (request ${requestId}): ${detail}`);
      recordUsageAfterResponse(tenantId, userId, {
        operation: "live",
        unitType: "session",
        requestId,
        status: "error",
        modelVendor: LIVE_MODEL.vendor,
        modelId: LIVE_MODEL.modelId,
        errorCode: "PROVIDER_ERROR",
        latencyMs,
        metadata: { platform, resumed },
      });
      return errorResponse(502, "PROVIDER_ERROR", "Live API token could not be issued.", requestId);
    }
  } catch (error) {
    if (error instanceof GatewayError) {
      return gatewayErrorResponse(error, requestId);
    }
    console.error("[/api/ai/live-token] internal error:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unclassified server failure.", requestId);
  }
}
