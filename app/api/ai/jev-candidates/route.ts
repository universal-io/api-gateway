import { authenticateAIRequest, enforceQuota, errorResponse, gatewayErrorResponse,
  recordUsageAfterResponse, GatewayError } from "@/lib/server/gateway";
import { JEV_EXPERIMENT_MODEL } from "@/lib/server/ai-routing";
import { jevInputSchema, runJev } from "@/lib/server/jev-candidates";
import { z } from "zod";

export const maxDuration = 20;
const schema = z.object({
  request_id: z.string().uuid(), operation: z.literal("jev_candidates"), input: jevInputSchema,
  client: z.object({platform: z.literal("macos"), app_version: z.string().max(128),
    build_number: z.string().max(128)}).strict(),
}).strict();

export async function POST(request: Request): Promise<Response> {
  let requestId: string | null = null;
  try {
    const key = process.env.TYPESAFE_API_KEY;
    const users = (process.env.JEV_EXPERIMENT_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    if (!key || users.length === 0) return errorResponse(503, "EXPERIMENT_UNAVAILABLE",
      "Jev実験はGateway側で未設定です。", null);
    const auth = await authenticateAIRequest(request);
    if (!users.includes(auth.userId)) return errorResponse(403, "EXPERIMENT_FORBIDDEN",
      "このアカウントはJev実験の対象外です。", null);
    // Bound the actual streamed body, including chunked requests.
    const reader = request.body?.getReader();
    if (!reader) return errorResponse(400, "BAD_REQUEST", "JSON body required.", null);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 512_000) {
        await reader.cancel();
        return errorResponse(413, "BAD_REQUEST", "Request too large.", null);
      }
      chunks.push(value);
    }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return errorResponse(400, "BAD_REQUEST", "Invalid JSON.", null); }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return errorResponse(400, "BAD_REQUEST", "Invalid Jev candidate request.", null);
    const body = parsed.data;
    requestId = body.request_id;
    await enforceQuota(auth.tenantId, auth.entitlement);
    let result;
    try { result = await runJev(body.input, key, JEV_EXPERIMENT_MODEL, request.signal); }
    catch {
      return errorResponse(502, "PROVIDER_ERROR", "Jevの応答を取得・検証できませんでした。再試行してください。", requestId);
    }
    recordUsageAfterResponse(auth.tenantId, auth.userId, {
      operation: "vision", unitType: "call", requestId, status: "success",
      modelVendor: "typesafe", modelId: result.model, inputUnits: result.input_tokens,
      latencyMs: result.provider_ms,
      metadata: {experiment: "jev_candidates", candidate_count: body.input.candidates.length},
    });
    return Response.json({request_id: requestId, snapshot_id: body.input.snapshot_id, result},
      {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    if (error instanceof GatewayError) return gatewayErrorResponse(error, requestId);
    return errorResponse(500, "INTERNAL_ERROR", "Jev実験の処理に失敗しました。", requestId);
  }
}
