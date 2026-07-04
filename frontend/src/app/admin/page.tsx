"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch, statusTone, type AdminStats } from "@/lib/admin";
import { money } from "@/lib/format";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<AdminStats>("/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="font-mono text-sm text-ember">{error}</p>;
  if (!stats) return <p className="label-caps text-silver">Loading dashboard…</p>;

  const cards = [
    { label: "Revenue (paid)", value: money(stats.revenueCents), href: "/admin/orders" },
    { label: "Orders", value: `${stats.ordersPaid} paid / ${stats.ordersTotal}`, href: "/admin/orders" },
    { label: "Awaiting fulfilment", value: String(stats.ordersAwaitingFulfilment), href: "/admin/orders?status=paid" },
    {
      label: "Products",
      value: `${stats.products}${stats.productsOutOfStock ? ` (${stats.productsOutOfStock} out of stock)` : ""}`,
      href: "/admin/products",
    },
    { label: "Subscribers", value: String(stats.subscribers), href: "/admin/subscribers" },
    { label: "Unread messages", value: String(stats.unreadMessages), href: "/admin/messages" },
  ];

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Dashboard</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="border border-steel bg-carbon p-5 hover:border-crimson">
            <p className="label-caps text-silver">{card.label}</p>
            <p className="mt-2 font-mono text-2xl font-bold text-offwhite">{card.value}</p>
          </Link>
        ))}
      </div>

      <h2 className="display mt-12 text-2xl">Recent Orders</h2>
      {stats.recentOrders.length === 0 ? (
        <p className="mt-4 font-mono text-sm text-silver">No orders yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-steel">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-coal">
              <tr>
                {["Order", "Customer", "Status", "Total", ""].map((h) => (
                  <th key={h} className="label-caps px-4 py-3 text-silver">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-steel/60 bg-carbon">
                  <td className="px-4 py-3 font-mono text-xs">#{o.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 text-chrome">{o.email}</td>
                  <td className={`label-caps px-4 py-3 ${statusTone(o.status)}`}>{o.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 font-mono font-bold text-ember">{money(o.totalCents)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="label-caps text-ember hover:text-blush">
                      View
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
