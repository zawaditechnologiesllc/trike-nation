"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminFetch,
  formatStatus,
  statusTone,
  ORDER_STATUSES,
  type AdminOrderRow,
} from "@/lib/admin";
import { money } from "@/lib/format";
import { orderReference } from "@/shared/core/orders";

function OrdersContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrders(null);
    setError("");
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (search.trim()) qs.set("q", search.trim());
    // Debounced so typing in the search box doesn't hammer the API.
    const timer = setTimeout(() => {
      adminFetch<AdminOrderRow[]>(`/orders${qs.size ? `?${qs}` : ""}`)
        .then(setOrders)
        .catch((e) => setError(e.message));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [status, search]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">Orders</h1>
          <p className="mt-1 font-mono text-xs text-silver">
            Payments are confirmed here by hand — start with “needs action”.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input-tech w-auto"
            placeholder="Search by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-tech w-auto">
            <option value="">All statuses</option>
            <option value="needs_action">⚑ Needs action</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatStatus(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!orders && !error && <p className="label-caps mt-6 text-silver">Loading orders…</p>}
      {orders && orders.length === 0 && <p className="mt-6 font-mono text-sm text-silver">No orders found.</p>}
      {orders && orders.length > 0 && (
        <div className="mt-6 overflow-x-auto border border-steel">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-coal">
              <tr>
                {["Order", "Date", "Customer", "From", "Account", "Payment", "Status", "Total", ""].map((h) => (
                  <th key={h} className="label-caps px-4 py-3 text-silver">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-steel/60 bg-carbon">
                  <td className="px-4 py-3 font-mono text-xs">{orderReference(o.id, o.order_number)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-silver">
                    {new Date(o.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-3 text-chrome">{o.email}</td>
                  <td className="label-caps px-4 py-3">
                    <span className="text-silver">{o.origin_country ?? "—"}</span>
                    {/* Badged only when something is worth a look, so the
                        badge keeps meaning something. */}
                    {(o.risk_level === "review" || o.risk_level === "high") && (
                      <span className={`ml-2 ${o.risk_level === "high" ? "text-ember" : "text-amber"}`}>●</span>
                    )}
                  </td>
                  <td className="label-caps px-4 py-3">
                    {o.user_id ? (
                      <span className="text-success">linked</span>
                    ) : o.account_invite_sent_at ? (
                      <span className="text-amber">invited</span>
                    ) : (
                      <span className="text-silver">guest</span>
                    )}
                  </td>
                  <td className={`label-caps px-4 py-3 ${o.payment_status === "paid" ? "text-success" : "text-silver"}`}>
                    {o.payment_status}
                  </td>
                  <td className={`label-caps px-4 py-3 ${statusTone(o.status)}`}>{formatStatus(o.status)}</td>
                  <td className="px-4 py-3 font-mono font-bold text-ember">{money(o.total_cents)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="label-caps text-ember hover:text-blush">
                      {o.status === "awaiting_confirmation" ? "Confirm →" : "Manage"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  );
}
