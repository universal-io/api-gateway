import {
  authenticateAIRequest,
  errorResponse,
  gatewayErrorResponse,
  GatewayError,
  warmAIRequest,
} from "@/lib/server/gateway";
import { getServerEnv } from "@/lib/server/env";
import { DECIDE_MODEL } from "@/lib/server/ai-routing";
import { parseDecideInput, runDecide } from "@/lib/server/decide";

// Reflex experiment (app-mac companion build 37, 2026-10-13). A typed
// decision from a System One model: fast, near free, no generated text. The
// companion asks it dozens of times per session (is this a screen question,
// which reading would answer it, does this answer name controls that exist),
// so this route counts nothing against the monthly quota and writes no usage
// event — bs_usage_events is counted per row regardless of operation. It is
// open to the admin allowlist only while it is an experiment.

const MAX_BODY_BYTES = 256_000;

type DecideRequestBody = {
  request_id?: unknown;
  operation?: unknown;
  input?: unknown;
  client?: { platform?: unknown };
};

export const maxDuration = 15;

export const GET = warmAIRequest;

export async function POST(request: Request): Promise<Response> {
  let requestId: string | null = null;
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return errorResponse(413, "BAD_REQUEST", "Request too large.", null);
    const body = (await request.json().catch(() => null)) as DecideRequestBody | null;
    if (!body) return errorResponse(400, "BAD_REQUEST", "Request body must be JSON.", null);
    requestId = typeof body.request_id === "string" && body.request_id ? body.request_id : null;
    if (!requestId) return errorResponse(400, "BAD_REQUEST", "request_id is required.", null);
    if (body.operation !== "decide") return errorResponse(400, "BAD_REQUEST", "operation must be 'decide'.", requestId);
    const platform = body.client?.platform;
    if (platform !== "macos") return errorResponse(400, "BAD_REQUEST", "client.platform is required.", requestId);
    const input = parseDecideInput(body.input);
    if ("error" in input) return errorResponse(400, "BAD_REQUEST", input.error, requestId);

    const auth = await authenticateAIRequest(request);
    const env = getServerEnv();
    // By user id first: the AI routes verify the JWT locally, and whether its
    // claims carry an email is not something this gate should depend on
    // (build 37 on the device, 2026-10-14: 403 for the admin's own account).
    const allowed = env.reflexUserIds.includes(auth.userId)
      || (auth.email !== null && env.adminEmails.includes(auth.email.toLowerCase()));
    if (!allowed) {
      console.warn(
        `[/api/ai/decide] forbidden: user=${auth.userId} email=${auth.email ? "present" : "absent"} ` +
          `ids=${env.reflexUserIds.length} admins=${env.adminEmails.length}`,
      );
      return errorResponse(403, "EXPERIMENT_FORBIDDEN", "このアカウントは反射の実験の対象外です。", requestId);
    }
    if (!env.openrouterApiKey) {
      return errorResponse(503, "PROVIDER_ERROR", "判定モデルは Gateway 側で未設定です。", requestId);
    }

    try {
      const result = await runDecide(input, env.openrouterApiKey, DECIDE_MODEL.modelId, request.signal);
      console.log(
        `[/api/ai/decide] ${result.model} ${result.provider_ms}ms in=${result.input_tokens} ` +
          `questions=${Object.keys(input.questions).length}`,
      );
      return Response.json(
        {
          request_id: requestId,
          result: { answers: result.answers },
          meta: {
            model_vendor: DECIDE_MODEL.vendor,
            model_id: result.model,
            latency_ms: result.provider_ms,
            input_tokens: result.input_tokens,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[/api/ai/decide] failed (request ${requestId}): ${detail}`);
      return errorResponse(502, "PROVIDER_ERROR", "判定モデルの応答を取得・検証できませんでした。", requestId);
    }
  } catch (error) {
    if (error instanceof GatewayError) return gatewayErrorResponse(error, requestId);
    console.error("[/api/ai/decide] internal error:", error);
    return errorResponse(500, "INTERNAL_ERROR", "Unclassified server failure.", requestId);
  }
}
