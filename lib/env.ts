export type PublicEnv = {
  apiBaseUrl: string | null;
  isConfigured: boolean;
  supabaseAnonKey: string | null;
  supabaseUrl: string | null;
};

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = normalize(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const apiBaseUrl = normalize(process.env.NEXT_PUBLIC_BOMB_SQUAD_API_BASE_URL);

  return {
    apiBaseUrl,
    isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseAnonKey,
    supabaseUrl,
  };
}

function normalize(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
