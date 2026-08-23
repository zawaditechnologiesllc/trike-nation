"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin";

interface Row {
  id: string;
  message: string;
  href: string | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  position: number;
}

const empty = { message: "", href: "", startsAt: "", endsAt: "", position: 0 };

export default function AnnouncementsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState(empty);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await adminFetch<Row[]>("/announcements"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load announcements");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(label: string, fn: () => Promise<{ message?: string }>) {
    setStatus("");
    setError("");
    try {
      const result = await fn();
      // Every control says what it actually did.
      setStatus(result.message ?? `${label} done.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    }
  }

  const scheduleLabel = (row: Row) => {
    const now = new Date();
    if (!row.active) return { text: "Paused", tone: "text-on-surface-muted" };
    if (row.starts_at && new Date(row.starts_at) > now)
      return { text: `Starts ${new Date(row.starts_at).toLocaleDateString("en-US")}`, tone: "text-signal-orange" };
    if (row.ends_at && new Date(row.ends_at) < now)
      return { text: `Ended ${new Date(row.ends_at).toLocaleDateString("en-US")}`, tone: "text-on-surface-muted" };
    return { text: "Live now", tone: "text-signal-positive" };
  };

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Announcements</h1>
      <p className="mt-1 font-mono text-xs text-on-surface-muted">
        The stripe scrolling across the top of every page. Each notice has its own schedule and
        position — a scheduled one is not sent to the browser until it starts.
      </p>

      {status && <p className="mt-4 font-mono text-sm text-signal-positive">{status}</p>}
      {error && <p className="mt-4 font-mono text-sm text-error">{error}</p>}

      <div className="mt-6 border border-outline bg-surface-container p-5">
        <p className="label-caps text-on-secondary-fixed">New notice</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label-caps text-on-surface-muted">Message</span>
            <input className="input-tech mt-2" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder="Free shipping worldwide this week" />
          </label>
          <label className="block">
            <span className="label-caps text-on-surface-muted">Link (optional)</span>
            <input className="input-tech mt-2" value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} placeholder="/shop" />
          </label>
          <label className="block">
            <span className="label-caps text-on-surface-muted">Position</span>
            <input type="number" className="input-tech mt-2" value={draft.position} onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="label-caps text-on-surface-muted">Starts (optional)</span>
            <input type="datetime-local" className="input-tech mt-2" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
          </label>
          <label className="block">
            <span className="label-caps text-on-surface-muted">Ends (optional)</span>
            <input type="datetime-local" className="input-tech mt-2" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
          </label>
        </div>
        <button
          disabled={!draft.message.trim()}
          onClick={() =>
            act("Create", async () => {
              const result = await adminFetch<{ message: string }>("/announcements", {
                method: "POST",
                body: JSON.stringify({
                  message: draft.message,
                  href: draft.href || null,
                  position: draft.position,
                  startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
                  endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
                }),
              });
              setDraft(empty);
              return result;
            })
          }
          className="display glow-red mt-4 bg-primary px-6 py-2.5 text-on-primary hover:bg-secondary disabled:opacity-50"
        >
          Add notice
        </button>
      </div>

      {rows === null ? (
        <p className="label-caps mt-8 text-on-surface-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 font-mono text-sm text-on-surface-muted">
          No notices yet — the stripe falls back to the ticker in Site Settings.
        </p>
      ) : (
        <div className="mt-8 space-y-3">
          {rows.map((row) => {
            const schedule = scheduleLabel(row);
            return (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-4 border border-outline bg-surface-container p-4">
                <div className="min-w-0">
                  <p className="text-sm text-on-surface">{row.message}</p>
                  <p className="mt-1 font-mono text-xs text-on-surface-muted">
                    position {row.position}
                    {row.href ? ` · links to ${row.href}` : ""} ·{" "}
                    <span className={schedule.tone}>{schedule.text}</span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      act("Update", () =>
                        adminFetch<{ message: string }>(`/announcements/${row.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ active: !row.active }),
                        }),
                      )
                    }
                    className="label-caps text-on-surface-variant hover:text-secondary"
                  >
                    {row.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm("Delete this notice?")) return;
                      void act("Delete", () =>
                        adminFetch<{ message: string }>(`/announcements/${row.id}`, { method: "DELETE" }),
                      );
                    }}
                    className="label-caps text-on-surface-muted hover:text-error"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
