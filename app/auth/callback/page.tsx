import { Suspense } from "react";
import { AuthCallbackHandler } from "./callback-handler";

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 px-6 text-stone-950">
      <Suspense
        fallback={
          <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-stone-600">メールリンクのログインを確認しています。</p>
          </section>
        }
      >
        <AuthCallbackHandler />
      </Suspense>
    </main>
  );
}
