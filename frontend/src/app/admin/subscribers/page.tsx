"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin";

interface Subscriber {
  email: string;
  created_at: string;
}

export default function AdminSubscribersPage() {
  const [subs, setSubs] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState("");

  function load() {
    adminFetch<Subscriber[]>("/subscribers").then(setSubs).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function remove(email: string) {
    if (!window.confirm(`Remove ${email} from the newsletter?`)) return;
    await adminFetch(`/subscribers/${encodeURIComponent(email)}`, { method: "DELETE" });
    load();
  }

  function exportCsv() {
    if (!subs) return;
    const csv = ["email,subscribed_at", ...subs.map((s) => `${s.email},${s.created_at}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "trike-nation-subscribers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl md:text-4xl">Newsletter Subscribers</h1>
        <button onClick={exportCsv} disabled={!subs?.length} className="display border-2 border-chrome px-5 py-2 text-sm text-chrome hover:border-ember hover:text-ember disabled:opacity-40">
          Export CSV
        </button>
      </div>
      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!subs && !error && <p className="label-caps mt-6 text-silver">Loading subscribers…</p>}
      {subs && (
        <div className="mt-6 space-y-2">
          {subs.map((s) => (
            <div key={s.email} className="flex items-center justify-between gap-4 border border-steel bg-carbon px-4 py-3">
              <span className="break-all font-mono text-sm text-chrome">{s.email}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-silver">
                  {new Date(s.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                </span>
                <button onClick={() => remove(s.email)} className="label-caps text-silver hover:text-ember">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {subs.length === 0 && <p className="font-mono text-sm text-silver">No subscribers yet.</p>}
        </div>
      )}
    </div>
  );
}
