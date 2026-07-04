"use client";

import { useState } from "react";
import { sendContactMessage } from "@/lib/api";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [field]: e.target.value });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    const result = await sendContactMessage(form);
    setStatus(result.ok ? "done" : "error");
    setFeedback(result.message);
    if (result.ok) setForm({ name: "", email: "", subject: "", message: "" });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="label-caps text-silver">Name</span>
          <input required className="input-tech mt-2" placeholder="Your name" value={form.name} onChange={set("name")} />
        </label>
        <label className="block">
          <span className="label-caps text-silver">Email</span>
          <input
            required
            type="email"
            className="input-tech mt-2"
            placeholder="you@example.com"
            value={form.email}
            onChange={set("email")}
          />
        </label>
      </div>
      <label className="block">
        <span className="label-caps text-silver">Subject</span>
        <input
          className="input-tech mt-2"
          placeholder="Custom build, order question, warranty…"
          value={form.subject}
          onChange={set("subject")}
        />
      </label>
      <label className="block">
        <span className="label-caps text-silver">Message</span>
        <textarea
          required
          rows={5}
          className="input-tech mt-2 resize-y"
          placeholder="Tell us about the machine you're dreaming of."
          value={form.message}
          onChange={set("message")}
        />
      </label>
      {feedback && (
        <p className={`font-mono text-xs ${status === "error" ? "text-ember" : "text-success"}`}>{feedback}</p>
      )}
      <button
        type="submit"
        disabled={status === "busy"}
        className="display glow-red bg-crimson px-10 py-3 text-lg text-offwhite transition-colors hover:bg-ember disabled:opacity-50"
      >
        {status === "busy" ? "Sending…" : "Send Message →"}
      </button>
    </form>
  );
}
