"use client";

import { useEffect, useState } from "react";
import { adminFetch, type AdminMessage } from "@/lib/admin";

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<AdminMessage[] | null>(null);
  const [error, setError] = useState("");

  function load() {
    adminFetch<AdminMessage[]>("/messages").then(setMessages).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function markRead(msg: AdminMessage) {
    await adminFetch(`/messages/${msg.id}`, { method: "PATCH", body: JSON.stringify({ read: !msg.read }) });
    load();
  }

  async function remove(msg: AdminMessage) {
    if (!window.confirm("Delete this message?")) return;
    await adminFetch(`/messages/${msg.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Contact Messages</h1>
      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!messages && !error && <p className="label-caps mt-6 text-silver">Loading inbox…</p>}
      {messages && messages.length === 0 && <p className="mt-6 font-mono text-sm text-silver">Inbox zero. Nice.</p>}
      <div className="mt-6 space-y-4">
        {messages?.map((msg) => (
          <div key={msg.id} className={`border bg-carbon p-5 ${msg.read ? "border-steel" : "border-crimson"}`}>
            <div className="flex flex-wrap items-center gap-3">
              {!msg.read && <span className="label-caps bg-crimson px-2 py-0.5 text-offwhite">New</span>}
              <span className="display text-lg">{msg.subject || "(no subject)"}</span>
              <span className="ml-auto font-mono text-xs text-silver">
                {new Date(msg.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-blush">
              {msg.name} &lt;{msg.email}&gt;
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-chrome">{msg.message}</p>
            <div className="mt-4 flex gap-4">
              <a href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || "Your message to Go Cart Grip")}`} className="label-caps text-ember hover:text-blush">
                Reply by Email
              </a>
              <button onClick={() => markRead(msg)} className="label-caps text-chrome hover:text-ember">
                Mark {msg.read ? "Unread" : "Read"}
              </button>
              <button onClick={() => remove(msg)} className="label-caps text-silver hover:text-ember">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
