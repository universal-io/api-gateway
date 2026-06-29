"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const env = getPublicEnv();
type AuthMode = "signup" | "signin";

export function AuthShell() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasSentCode, setHasSentCode] = useState(false);

  useEffect(() => {
    if (!env.isConfigured) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.email) {
        setEmail(data.session.user.email);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user.email) {
        setEmail(nextSession.user.email);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function sendOtp() {
    if (!env.isConfigured || !email.trim()) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: mode === "signup",
        },
      });

      if (error) {
        throw error;
      }

      setHasSentCode(true);
      setStatusMessage(
        mode === "signup"
          ? "登録用コードを送信しました。メールの OTP を入力してください。"
          : "ログイン用コードを送信しました。メールの OTP を入力してください。"
      );
    } catch (error) {
      setErrorMessage(messageOf(error));
    } finally {
      setIsSending(false);
    }
  }

  async function verifyOtp() {
    if (!env.isConfigured || !email.trim() || !otp.trim()) {
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "email",
      });

      if (error) {
        throw error;
      }

      setOtp("");
      setHasSentCode(false);
      setStatusMessage(mode === "signup" ? "登録してログインしました。" : "ログインしました。");
    } catch (error) {
      setErrorMessage(messageOf(error));
    } finally {
      setIsVerifying(false);
    }
  }

  async function signOut() {
    if (!env.isConfigured) {
      return;
    }

    setIsSigningOut(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setOtp("");
      setHasSentCode(false);
      setStatusMessage("ログアウトしました。");
    } catch (error) {
      setErrorMessage(messageOf(error));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-stone-950/10 bg-[#fbf7ef] p-6 text-stone-950 shadow-[0_30px_80px_rgba(22,14,3,0.2)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-stone-500">
            Access
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Bomb Squad account
          </h2>
        </div>
        <div className="rounded-full border border-stone-900/10 px-3 py-1 text-xs text-stone-600">
          {session ? "ログイン済み" : "未ログイン"}
        </div>
      </div>

      {!env.isConfigured ? (
        <div className="mt-8 rounded-3xl border border-dashed border-stone-400 bg-stone-950/[0.03] p-5">
          <p className="text-sm leading-7 text-stone-700">
            `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定すると、
            このページから Bomb Squad の登録・ログインができます。
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <div className="inline-flex rounded-full border border-stone-900/10 bg-stone-950/[0.04] p-1">
            <button
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-stone-950 text-stone-50"
                  : "text-stone-700 hover:text-stone-950"
              }`}
              onClick={() => {
                setMode("signup");
                setHasSentCode(false);
                setOtp("");
                setStatusMessage(null);
                setErrorMessage(null);
              }}
              type="button"
            >
              Sign up
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-stone-950 text-stone-50"
                  : "text-stone-700 hover:text-stone-950"
              }`}
              onClick={() => {
                setMode("signin");
                setHasSentCode(false);
                setOtp("");
                setStatusMessage(null);
                setErrorMessage(null);
              }}
              type="button"
            >
              Sign in
            </button>
          </div>

          <div className="rounded-3xl border border-stone-900/10 bg-stone-950/[0.03] p-5">
            <p className="text-sm text-stone-500">
              {mode === "signup" ? "新規登録フロー" : "既存アカウントのログインフロー"}
            </p>
            <p className="mt-2 text-base leading-7 text-stone-800">
              {mode === "signup"
                ? "初回利用者向けです。email を送って OTP を受け取り、そのコードでアカウント作成とログインを完了します。"
                : "既存ユーザー向けです。登録済み email に OTP を送り、そのコードでログインします。"}
            </p>
          </div>

          <ol className="grid gap-3 rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5 text-sm leading-7 text-stone-800">
            <li>1. まず {mode === "signup" ? "登録したい" : "登録済みの"} email を入力して `Send code` を押します。</li>
            <li>2. Supabase から届いた OTP を確認します。</li>
            <li>3. そのあとで OTP 入力欄にコードを入れて `{mode === "signup" ? "Create account" : "Sign in"}` を押します。</li>
          </ol>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-700">Email</span>
            <input
              className="w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 outline-none transition focus:border-orange-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-stone-900/15 px-5 py-3 text-sm font-medium transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSending || !email.trim()}
              onClick={sendOtp}
              type="button"
            >
              {isSending ? "Sending..." : mode === "signup" ? "Send sign-up code" : "Send sign-in code"}
            </button>
            {hasSentCode ? (
              <div className="rounded-full bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950">
                コード送信済み。受信メールを確認してください。
              </div>
            ) : null}
          </div>

          {hasSentCode ? (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-700">OTP code</span>
                <input
                  className="w-full rounded-2xl border border-stone-900/15 bg-white px-4 py-3 outline-none transition focus:border-orange-500"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="6-digit code"
                  inputMode="numeric"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isVerifying || !email.trim() || !otp.trim()}
                  onClick={verifyOtp}
                  type="button"
                >
                  {isVerifying
                    ? mode === "signup"
                      ? "Creating account..."
                      : "Signing in..."
                    : mode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </button>
                <button
                  className="rounded-full border border-stone-900/15 px-5 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-900"
                  onClick={() => {
                    setHasSentCode(false);
                    setOtp("");
                    setStatusMessage(null);
                    setErrorMessage(null);
                  }}
                  type="button"
                >
                  Start over
                </button>
              </div>
            </>
          ) : null}

          {session ? (
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full border border-stone-900/15 px-5 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSigningOut}
                onClick={signOut}
                type="button"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <button className="rounded-2xl border border-stone-900/10 bg-stone-950/[0.03] px-4 py-4 text-left text-sm text-stone-500" disabled type="button">
              Google
              <span className="mt-2 block text-xs text-stone-400">next</span>
            </button>
            <button className="rounded-2xl border border-stone-900/10 bg-stone-950/[0.03] px-4 py-4 text-left text-sm text-stone-500" disabled type="button">
              Apple ID
              <span className="mt-2 block text-xs text-stone-400">next</span>
            </button>
            <Link
              className="rounded-2xl border border-stone-900/10 bg-orange-500/10 px-4 py-4 text-left text-sm text-stone-800 transition hover:bg-orange-500/20"
              href="/pricing"
            >
              Pricing
              <span className="mt-2 block text-xs text-stone-500">upgrade path</span>
            </Link>
          </div>

          {session?.user.email ? (
            <div className="rounded-3xl border border-emerald-700/20 bg-emerald-500/10 p-5">
              <p className="text-sm text-emerald-800">現在のセッション</p>
              <p className="mt-2 text-lg font-semibold text-emerald-950">{session.user.email}</p>
            </div>
          ) : null}

          {statusMessage ? (
            <div className="rounded-2xl border border-emerald-700/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950">
              {statusMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm text-red-950">
              {errorMessage}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function messageOf(error: unknown) {
  if (isStatus500(error)) {
    return "Supabase Auth の `/otp` が 500 を返しました。Email provider 未設定、OTP テンプレート未調整、または auth.users への既存 trigger / constraint が新規 user 作成を壊している可能性があります。Supabase の Auth logs と Postgres logs を確認してください。";
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown authentication error";
  }
}

function isStatus500(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 500
  );
}
