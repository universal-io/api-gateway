"use client";

import Link from "next/link";
import { useBrowserSession } from "@/lib/supabase/use-browser-session";

export function HomeAuthNav() {
  const { isConfigured, isLoading, session } = useBrowserSession();

  if (!isConfigured || isLoading || !session?.user.email) {
    return (
      <nav className="flex items-center gap-3 text-sm">
        <Link className="rounded-full border border-stone-400/70 px-4 py-2 transition hover:border-stone-900" href="/pricing">
          Pricing
        </Link>
        <Link className="rounded-full bg-stone-950 px-4 py-2 font-medium text-stone-50 transition hover:bg-stone-800" href="/auth">
          ログイン
        </Link>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-3 text-sm">
      <div className="max-w-52 truncate rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-stone-700">
        {session.user.email}
      </div>
      <Link className="rounded-full bg-stone-950 px-4 py-2 font-medium text-stone-50 transition hover:bg-stone-800" href="/auth">
        アカウント
      </Link>
    </nav>
  );
}
