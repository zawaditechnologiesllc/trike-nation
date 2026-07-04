"use client";

import { useState } from "react";
import { subscribeNewsletter } from "@/lib/api";

export default function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setStatus("error");
      setMessage("Enter a valid email address.");
      return;
    }
    setStatus("busy");
    const result = await subscribeNewsletter(email);
    setStatus(result.ok ? "done" : "error");
    setMessage(result.message);
    if (result.ok) setEmail("");
  }

  return (
    <form onSubmit={submit} className={compact ? "" : "mx-auto max-w-xl"}>
      <div className="flex">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ENTER YOUR EMAIL"
          className="input-tech flex-1"
          aria-label="Email address"
        />
        <button
          type="submit"
          disabled={status === "busy"}
          className="display glow-red bg-crimson px-6 text-sm text-offwhite transition-colors hover:bg-ember disabled:opacity-50"
        >
          {status === "busy" ? "…" : "Subscribe"}
        </button>
      </div>
      {message && (
        <p className={`mt-2 font-mono text-xs ${status === "error" ? "text-ember" : "text-success"}`}>{message}</p>
      )}
    </form>
  );
}
