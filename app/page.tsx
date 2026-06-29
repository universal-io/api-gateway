import Link from "next/link";

const pillars = [
  {
    title: "Shared Identity",
    body: "Supabase Auth を共通の ID レイヤーにして、macOS / iOS / Android / Web で同じアカウントを使える前提で進めます。",
  },
  {
    title: "Metered Usage",
    body: "無料枠は月 50 回を前提にし、後続の gateway で usage ledger と課金導線をつなぎます。",
  },
  {
    title: "Server-Owned AI",
    body: "LLM キーはクライアントに置かず、Vercel 上の product API から AI provider を呼ぶ構成に寄せます。",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,196,61,0.22),_transparent_32%),linear-gradient(180deg,_#f7f1e3_0%,_#efe2c5_38%,_#ead7b1_100%)] text-stone-950">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-stone-600">
              Bomb Squad
            </div>
            <p className="mt-2 max-w-md text-sm text-stone-700">
              macOS から始めて、同じアカウント基盤を mobile と web に広げるための product shell。
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link className="rounded-full border border-stone-400/70 px-4 py-2 transition hover:border-stone-900" href="/pricing">
              Pricing
            </Link>
            <Link className="rounded-full bg-stone-950 px-4 py-2 font-medium text-stone-50 transition hover:bg-stone-800" href="/auth">
              Sign In
            </Link>
          </nav>
        </header>

        <div className="grid gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-orange-700">
              Review before send
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl leading-[0.94] font-semibold tracking-[-0.05em] text-stone-950 sm:text-6xl lg:text-7xl">
              会話の爆発半径を
              <br />
              送信前に小さくする。
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
              Bomb Squad は、きつい表現や曖昧な言い回しを送信前に検知して、伝わり方を整えるための review layer です。
              次に作る web 導線は、認証、無料枠、アップグレード、今後の管理画面の入口になります。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-orange-400" href="/auth">
                認証画面を見る
              </Link>
              <Link className="rounded-full border border-stone-400/70 px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-900" href="/pricing">
                料金のたたき台を見る
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-950/10 bg-stone-950 p-6 text-stone-50 shadow-[0_30px_80px_rgba(53,36,4,0.18)]">
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-orange-300">
              Current Surface
            </div>
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl bg-stone-900/70 p-4">
                <p className="text-sm text-stone-400">現在ある UI</p>
                <p className="mt-2 text-lg font-semibold">macOS 設定画面</p>
                <p className="mt-2 text-sm leading-6 text-stone-300">
                  `BombSquad/Views/SettingsView.swift` の中に、メール OTP の最小導線を実装済みです。
                </p>
              </div>
              <div className="rounded-2xl bg-stone-900/70 p-4">
                <p className="text-sm text-stone-400">今回追加する UI</p>
                <p className="mt-2 text-lg font-semibold">Vercel 配備用の web shell</p>
                <p className="mt-2 text-sm leading-6 text-stone-300">
                  `web/app` 配下にトップ、認証、料金ページを置き、将来の product site と billing 導線の土台にします。
                </p>
              </div>
            </div>
          </div>
        </div>

        <section className="grid gap-4 pb-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-[1.75rem] border border-stone-950/10 bg-white/55 p-5 backdrop-blur-sm"
            >
              <h2 className="text-lg font-semibold">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">{pillar.body}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
