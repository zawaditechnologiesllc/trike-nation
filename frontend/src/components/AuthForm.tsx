"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const supabase = getSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isLogin = mode === "login";

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
        router.push("/account");
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.session) {
          router.push("/account");
        } else {
          setNotice("Account created. Check your email to confirm your address, then sign in.");
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
      <h1 className="display mt-2 text-4xl md:text-5xl">
        {isLogin ? "Sign In" : "Join the Nation"}
      </h1>
      <p className="mt-4 text-sm text-silver">
        {isLogin
          ? "Access your garage, orders, and build history."
          : "Create an account to track orders and get early access to custom build drops."}
      </p>

      {!supabase ? (
        <div className="mt-10 border border-dashed border-steel-light p-6 font-mono text-xs leading-relaxed text-silver">
          Auth is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
          to enable email/password sign-in. See the project README for setup.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-6">
          <label className="block">
            <span className="label-caps text-silver">Email</span>
            <input
              type="email"
              required
              className="input-tech mt-2"
              placeholder="rider@trike-nation.com"
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
            New to the Nation?{" "}
            <Link href="/signup" className="text-ember hover:text-blush">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already enlisted?{" "}
            <Link href="/login" className="text-ember hover:text-blush">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
