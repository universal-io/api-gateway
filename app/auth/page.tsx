import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,_#22190c_0%,_#52371a_45%,_#f2d9a3_100%)] px-6 py-8 text-stone-50 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-orange-200">
              Bomb Squad Auth
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              登録とログインの
              <br />
              最初の web 入口
            </h1>
          </div>
          <Link className="rounded-full border border-white/30 px-4 py-2 text-sm transition hover:border-white/70" href="/">
            Home
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-white/15 bg-white/10 p-6 backdrop-blur-md">
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-orange-200">
              Scope
            </div>
            <div className="mt-6 space-y-5 text-sm leading-7 text-stone-100/90">
              <p>
                ここは Vercel 配備を前提にした product surface です。今の段階では、メール OTP の登録・ログインと、
                将来の Google / Apple 導線の置き場を先に固定します。
              </p>
              <p>
                macOS アプリ内の設定画面にも認証 UI はありますが、会員登録、料金説明、アップグレード、請求管理は
                web の方に集約する想定です。
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              {[
                "現在実装: メール OTP",
                "次に追加: Google OAuth",
                "その次: Apple ID",
                "後続: Stripe checkout / portal",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <AuthShell />
        </div>
      </div>
    </main>
  );
}
