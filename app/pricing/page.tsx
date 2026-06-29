import Link from "next/link";

const tiers = [
  {
    name: "Free",
    price: "¥0",
    note: "個人の試用向け",
    bullets: ["月 50 review", "共通モデル", "web / macOS 共通アカウント"],
  },
  {
    name: "Pro",
    price: "検討中",
    note: "継続利用向け",
    bullets: ["月次 quota 拡張", "優先モデル", "将来の履歴・設定同期"],
  },
  {
    name: "Enterprise",
    price: "要件定義",
    note: "法人向け",
    bullets: ["テナント単位管理", "個社 prompt / policy", "監査・保護要件に対応"],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6f3ea_0%,_#efe3c7_48%,_#dfc086_100%)] px-6 py-8 text-stone-950 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-stone-600">
              Pricing Draft
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              課金導線は
              <br />
              この web 側に置く
            </h1>
          </div>
          <Link className="rounded-full border border-stone-900/20 px-4 py-2 text-sm transition hover:border-stone-900" href="/auth">
            Auth
          </Link>
        </header>

        <section className="mt-10 grid gap-5 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article key={tier.name} className="rounded-[2rem] border border-stone-950/10 bg-white/60 p-6 shadow-[0_20px_60px_rgba(72,45,8,0.08)] backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">
                {tier.note}
              </p>
              <h2 className="mt-4 text-3xl font-semibold">{tier.name}</h2>
              <p className="mt-2 text-2xl text-orange-700">{tier.price}</p>
              <div className="mt-6 space-y-3 text-sm leading-6 text-stone-700">
                {tier.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-xl bg-stone-950/[0.04] px-3 py-2">
                    {bullet}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
