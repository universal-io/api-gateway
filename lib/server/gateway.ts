// Shared plumbing for AI gateway routes: Supabase JWT verification, tenant
// resolution, entitlement check, usage-event recording, and the error
// envelope (docs/api-contract.md). Route handlers own their own request
// validation and quota policy.

import {
  getSupabaseAdminClient,
  getSupabaseUserClient,
} from "@/lib/server/supabase-admin";

export type Entitlement = {
  plan: string;
  status: string;
  monthly_review_limit: number | null;
};

export type AuthContext = {
  userId: string;
  tenantId: string;
  entitlement: Entitlement;
};

/** Thrown by shared helpers; route handlers convert it via `errorResponse`. */
export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Verifies the Bearer token, resolves the default tenant (bootstrapping the
 * user lazily on first request), and checks the entitlement is usable.
 * Throws `GatewayError` on any failure.
 */
export async function authenticate(request: Request): Promise<AuthContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : null;
  if (!token) {
    throw new GatewayError(401, "UNAUTHENTICATED", "Missing Supabase access token.");
  }

  const admin = getSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw new GatewayError(401, "UNAUTHENTICATED", "Invalid Supabase access token.");
  }
  const userId = userData.user.id;

  let tenantId = await fetchDefaultTenantId(userId);
  if (!tenantId) {
    const userClient = getSupabaseUserClient(token);
    await userClient.rpc("bs_initialize_current_user");
    tenantId = await fetchDefaultTenantId(userId);
  }
  if (!tenantId) {
    throw new GatewayError(403, "TENANT_ACCESS_DENIED", "No tenant found for this user.");
  }

  const { data: entitlement } = await admin
    .from("bs_entitlements")
    .select("plan, status, monthly_review_limit")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !entitlement ||
    (entitlement.status !== "active" && entitlement.status !== "trialing")
  ) {
    throw new GatewayError(
      402,
      "PAYMENT_REQUIRED",
      "The current plan does not allow this operation.",
    );
  }

  return { userId, tenantId, entitlement };
}

async function fetchDefaultTenantId(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("bs_profiles")
    .select("default_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.default_tenant_id ?? null;
}

export type UsageInput = {
  operation: string;
  unitType: string;
  requestId: string;
  status: "success" | "error" | "blocked";
  modelVendor?: string;
  modelId?: string;
  inputUnits?: number;
  outputUnits?: number;
  errorCode?: string;
  latencyMs?: number;
  metadata: Record<string, unknown>;
};

export async function recordUsage(
  tenantId: string,
  userId: string,
  usage: UsageInput,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  // Idempotency: (tenant_id, request_id) is unique. A duplicate insert means a
  // client retry of an already-counted request; ignore the conflict. Only
  // success rows carry the request_id so a failed attempt can be retried.
  const { error } = await admin.from("bs_usage_events").insert({
    tenant_id: tenantId,
    user_id: userId,
    operation: usage.operation,
    model_vendor: usage.modelVendor ?? null,
    model_id: usage.modelId ?? null,
    input_units: usage.inputUnits ?? 0,
    output_units: usage.outputUnits ?? 0,
    unit_type: usage.unitType,
    request_id: usage.status === "success" ? usage.requestId : null,
    status: usage.status,
    error_code: usage.errorCode ?? null,
    latency_ms: usage.latencyMs ?? null,
    metadata: usage.metadata,
  });
  if (error && !error.message.includes("duplicate")) {
    console.error(
      `[gateway] usage event insert failed (${usage.operation}):`,
      error.message,
    );
  }
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string | null,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    {
      error: { code, message, ...(details ? { details } : {}) },
      request_id: requestId,
    },
    { status },
  );
}

export function gatewayErrorResponse(
  error: GatewayError,
  requestId: string | null,
): Response {
  return errorResponse(error.status, error.code, error.message, requestId, error.details);
}

export function currentMonthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
