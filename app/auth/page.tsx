import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

type AuthPageProps = {
  searchParams?: Promise<{
    provider?: string;
    status?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;

  return (
    <main className="min-h-dvh bg-stone-100 px-6 py-10 text-stone-950 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-balance text-stone-950 sm:text-4xl">
              Bomb Squad ログイン
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-pretty text-stone-600">
              メールアドレスまたは Google アカウントを使ってログインできます。
            </p>
          </div>
          <Link
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
            href="/"
          >
            Home
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <AuthShell initialProvider={params?.provider} initialStatus={params?.status} />

          <section className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-950">ご利用について</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <li>メールアドレスに届くログインリンクからアクセスできます。</li>
              <li>Google アカウントを使ってそのままログインできます。</li>
              <li>ログインが完了すると、この画面にアカウント情報が表示されます。</li>
            </ul>

            <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <h3 className="text-sm font-medium text-stone-950">ログインでできること</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                ログインすると、同じアカウント情報を使って Web とアプリを利用できます。
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
