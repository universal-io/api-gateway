import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/server/env";

let adminClient: SupabaseClient | null = null;

/** Service-role client for gateway-side reads/writes (bypasses RLS). */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }
  const env = getServerEnv();
  adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/**
 * Client scoped to the end user's access token, used to run auth-context RPCs
 * (e.g. `bs_initialize_current_user`, which relies on `auth.uid()`).
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const env = getServerEnv();
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
