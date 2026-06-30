"use client";

import Link from "next/link";
import { useBrowserSession } from "@/lib/supabase/use-browser-session";

export function HomeAccountPanel() {
  const { isConfigured, isLoading, session } = useBrowserSession();

  if (!isConfigured) {
    return (
      <section className="rounded-[2rem] border border-stone-950/10 bg-white/70 p-6 shadow-[0_24px_70px_rgba(53,36,4,0.12)]">
        <div className="text-sm font-medium text-stone-500">アカウント</div>
        <h2 className="mt-3 text-2xl font-semibold text-stone-950">ログイン設定を準備中です</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          認証設定が完了すると、この画面からログインできます。
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-[2rem] border border-stone-950/10 bg-white/70 p-6 shadow-[0_24px_70px_rgba(53,36,4,0.12)]">
        <div className="text-sm font-medium text-stone-500">アカウント</div>
        <h2 className="mt-3 text-2xl font-semibold text-stone-950">確認しています</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          ログイン状態を読み込んでいます。
        </p>
      </section>
    );
  }

  if (session?.user.email) {
    return (
      <section className="rounded-[2rem] border border-stone-950/10 bg-white/70 p-6 shadow-[0_24px_70px_rgba(53,36,4,0.12)]">
        <div className="text-sm font-medium text-stone-500">アカウント</div>
        <h2 className="mt-3 text-2xl font-semibold text-stone-950">ログイン済みです</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          現在このブラウザで利用中のアカウントです。
        </p>
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="text-sm text-stone-500">メールアドレス</div>
          <div className="mt-1 break-all text-base font-medium text-stone-950">{session.user.email}</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-stone-50 transition hover:bg-stone-800" href="/auth">
            アカウントを開く
          </Link>
          <Link className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950" href="/pricing">
            Pricing
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-stone-950/10 bg-white/70 p-6 shadow-[0_24px_70px_rgba(53,36,4,0.12)]">
      <div className="text-sm font-medium text-stone-500">アカウント</div>
      <h2 className="mt-3 text-2xl font-semibold text-stone-950">ログインして始める</h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        メールリンクまたは Google アカウントでログインできます。
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-stone-50 transition hover:bg-stone-800" href="/auth">
          ログイン
        </Link>
        <Link className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950" href="/pricing">
          Pricing
        </Link>
      </div>
    </section>
  );
}
