"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { claimOrders } from "@/lib/api";
import { BRAND } from "@/lib/brand";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const supabase = getSupabase();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isLogin = mode === "login";
  // An order invitation links here with the exact address the order used —
  // signing up with it is what attaches the order to the new account.
  const invitedEmail = params.get("email") ?? "";
  const pendingOrder = params.get("order") ?? "";

  useEffect(() => {
    if (invitedEmail) setEmail((current) => current || invitedEmail);
  }, [invitedEmail]);

  /** Adopt any guest orders placed with this address, then land in the garage. */
  async function finish() {
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
    if (token) await claimOrders(token);
    router.push(pendingOrder ? `/account?order=${pendingOrder}` : "/account");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await finish();
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          await finish();
        } else {
          setNotice(
            pendingOrder
              ? "Account created. Confirm your email address, then sign in — your order will be waiting in your garage."
              : "Account created. Check your email to confirm your address, then sign in.",
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <p className="label-caps text-blush">{isLogin ? "Rider Access" : "Enlist Now"}</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">{isLogin ? "Sign In" : "Join the Crew"}</h1>
      <p className="mt-4 text-sm text-silver">
        {isLogin
          ? "Access your garage, orders, and build history."
          : "Create an account to track orders and get early access to custom build drops."}
      </p>

      {pendingOrder && (
        <p className="mt-6 border border-crimson bg-crimson/10 p-4 font-mono text-xs leading-relaxed text-blush">
          Order #{pendingOrder.slice(0, 8).toUpperCase()} is waiting to be claimed.
          {invitedEmail ? (
            <>
              {" "}
              Use <strong className="text-offwhite">{invitedEmail}</strong> — that&apos;s the address
              the order was placed with.
            </>
          ) : (
            " Use the same email address you ordered with and it attaches automatically."
          )}
        </p>
      )}

      {!supabase ? (
        <div className="mt-10 border border-dashed border-steel-light p-6 font-mono text-xs leading-relaxed text-silver">
          Sign-in is temporarily unavailable. Please try again shortly or contact support.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-6">
          <label className="block">
            <span className="label-caps text-silver">Email</span>
            <input
              type="email"
              required
              className="input-tech mt-2"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label-caps text-silver">Password</span>
            <input
              type="password"
              required
              minLength={8}
              className="input-tech mt-2"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="font-mono text-xs text-ember">{error}</p>}
          {notice && <p className="font-mono text-xs text-success">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="display glow-red w-full bg-crimson py-4 text-lg text-offwhite transition-colors hover:bg-ember disabled:opacity-50"
          >
            {busy ? "…" : isLogin ? "Sign In →" : "Create Account →"}
          </button>
        </form>
      )}

      <p className="mt-8 text-center font-mono text-xs text-silver">
        {isLogin ? (
          <>
            New to {BRAND.name}?{" "}
            <Link
              href={pendingOrder ? `/signup?order=${pendingOrder}` : "/signup"}
              className="text-ember hover:text-blush"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already enlisted?{" "}
            <Link
              href={pendingOrder ? `/login?order=${pendingOrder}` : "/login"}
              className="text-ember hover:text-blush"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
