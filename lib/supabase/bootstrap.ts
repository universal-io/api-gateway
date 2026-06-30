import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const initializedUserIds = new Set<string>();

export async function ensureBombSquadUser(session: Session | null) {
  const userId = session?.user.id;
  if (!userId || initializedUserIds.has(userId)) {
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("bs_initialize_current_user");
  if (error) {
    throw error;
  }

  initializedUserIds.add(userId);
}
