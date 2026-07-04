"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminFetch, statusTone, ORDER_STATUSES, type AdminOrderRow } from "@/lib/admin";
import { money } from "@/lib/format";

function OrdersContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setOrders(null);
    adminFetch<AdminOrderRow[]>(`/orders${status ? `?status=${status}` : ""}`)
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, [status]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-3xl md:text-4xl">Orders</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-tech w-auto">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-6 font-mono text-sm text-ember">{error}</p>}
      {!orders && !error && <p className="label-caps mt-6 text-silver">Loading orders…</p>}
      {orders && orders.length === 0 && <p className="mt-6 font-mono text-sm text-silver">No orders found.</p>}
      {orders && orders.length > 0 && (
        <div className="mt-6 overflow-x-auto border border-steel">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-coal">
              <tr>
                {["Order", "Date", "Customer", "Provider", "Payment", "Status", "Total", ""].map((h) => (
                  <th key={h} className="label-caps px-4 py-3 text-silver">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-steel/60 bg-carbon">
                  <td className="px-4 py-3 font-mono text-xs">#{o.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-silver">
                    {new Date(o.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-3 text-chrome">{o.email}</td>
                  <td className="label-caps px-4 py-3 text-silver">{o.payment_provider ?? "—"}</td>
                  <td className={`label-caps px-4 py-3 ${o.payment_status === "paid" ? "text-success" : "text-silver"}`}>
                    {o.payment_status}
                  </td>
                  <td className={`label-caps px-4 py-3 ${statusTone(o.status)}`}>{o.status.replace(/_/g, " ")}</td>
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
