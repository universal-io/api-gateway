import Link from "next/link";
import { HomeAccountPanel } from "@/components/home-account-panel";
import { HomeAuthNav } from "@/components/home-auth-nav";

const pillars = [
  {
    title: "送る前に整える",
    body: "きつく聞こえる表現や曖昧な書き方を見直して、相手に伝わりやすい文章に整えます。",
  },
  {
    title: "下書きを残せる",
    body: "送信前に一度立ち止まり、書き換え候補を見比べながら落ち着いて判断できます。",
  },
  {
    title: "どこでも同じアカウント",
    body: "ログインすると、Web とアプリの両方で同じアカウント情報を使って続きから利用できます。",
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
              送る前に一呼吸おいて、伝わり方を整えるためのコミュニケーション補助ツールです。
            </p>
          </div>
          <HomeAuthNav />
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
              Bomb Squad は、会話の温度や文章の刺さり方を送信前に見直すためのサービスです。
              大事な相手に送る前の確認や、急いで返したい場面での言い換えに使えます。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-orange-400" href="/auth">
                ログインする
              </Link>
              <Link className="rounded-full border border-stone-400/70 px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-900" href="/pricing">
                Pricing
              </Link>
            </div>
          </div>

          <HomeAccountPanel />
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
