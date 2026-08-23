"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  adminFetch,
  formatStatus,
  statusTone,
  type AdminPaidOrders,
} from "@/lib/admin";
import { money } from "@/lib/format";
import { orderReference } from "@/shared/core/orders";

const RANGES = [
  { label: "All time", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/** Paid orders only — the money view, separate from the full order queue. */
export default function PaidOrdersPage() {
  const [range, setRange] = useState(0);
  const [data, setData] = useState<AdminPaidOrders | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setData(null);
    setError("");
    const since = range
      ? new Date(Date.now() - range * 86_400_000).toISOString()
      : "";
    try {
      setData(await adminFetch<AdminPaidOrders>(`/orders/paid${since ? `?since=${since}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load paid orders");
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    const header = "order_id,paid_at,email,status,total_cents,total,tracking_number,has_account";
    const rows = data.orders.map((o) =>
      [
        o.id,
        o.paid_at ?? "",
        o.email,
        o.status,
        o.total_cents,
        (o.total_cents / 100).toFixed(2),
        o.tracking_number ?? "",
        o.user_id ? "yes" : "no",
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gocartgrip-paid-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const cards = data
    ? [
        { label: "Revenue (confirmed)", value: money(data.totals.revenueCents) },
        { label: "Paid orders", value: String(data.totals.count) },
        { label: "Last 7 days", value: money(data.totals.last7DaysCents) },
        { label: "Last 30 days", value: money(data.totals.last30DaysCents) },
        { label: "Awaiting fulfilment", value: String(data.totals.awaitingFulfilment) },
        { label: "In transit", value: String(data.totals.inTransit) },
        { label: "Delivered", value: String(data.totals.delivered) },
        { label: "No account yet", value: String(data.totals.unlinkedAccounts) },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">Paid Orders</h1>
          <p className="mt-1 font-mono text-xs text-silver">
            Orders whose payment an admin has confirmed. Revenue counts these only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="input-tech w-auto"
          >
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            disabled={!data || data.orders.length === 0}
            className="label-caps border border-steel-light px-4 py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!data && !error && <p className="label-caps mt-6 text-silver">Loading paid orders…</p>}

      {data && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <div key={card.label} className="border border-steel bg-carbon p-5">
                <p className="label-caps text-silver">{card.label}</p>
                <p className="mt-2 font-mono text-2xl font-bold text-offwhite">{card.value}</p>
              </div>
            ))}
          </div>

          {data.orders.length === 0 ? (
            <p className="mt-8 font-mono text-sm text-silver">
              No confirmed payments in this range. Orders appear here once you confirm them in{" "}
              <Link href="/admin/orders?status=needs_action" className="text-ember hover:text-blush">
                the queue
              </Link>
              .
            </p>
          ) : (
            <div className="mt-8 overflow-x-auto border border-steel">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-coal">
                  <tr>
                    {["Order", "Paid", "Customer", "Account", "Status", "Tracking", "Total", ""].map((h) => (
                      <th key={h} className="label-caps px-4 py-3 text-silver">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id} className="border-t border-steel/60 bg-carbon">
                      <td className="px-4 py-3 font-mono text-xs">{orderReference(o.id, o.order_number)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-silver">
                        {o.paid_at
                          ? new Date(o.paid_at).toLocaleDateString("en-US", { dateStyle: "medium" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-chrome">{o.email}</td>
                      <td className="label-caps px-4 py-3">
                        {o.user_id ? (
                          <span className="text-success">linked</span>
                        ) : o.account_invite_sent_at ? (
                          <span className="text-amber">invited</span>
                        ) : (
                          <span className="text-silver">guest</span>
                        )}
                      </td>
                      <td className={`label-caps px-4 py-3 ${statusTone(o.status)}`}>
                        {formatStatus(o.status)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-silver">
                        {o.tracking_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-ember">{money(o.total_cents)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${o.id}`} className="label-caps text-ember hover:text-blush">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
