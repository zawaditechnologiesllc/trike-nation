"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { money } from "@/lib/format";

interface OrderRow {
  id: string;
  created_at: string;
  status: string;
  total_cents: number;
  discount_code: string | null;
}

export default function AccountPage() {
  const { user, loading, enabled, signOut } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    if (!loading && enabled && !user) router.replace("/login");
  }, [loading, enabled, user, router]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !user) return;
    supabase
      .from("orders")
      .select("id, created_at, status, total_cents, discount_code")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data ?? []);
        setOrdersLoaded(true);
      });
  }, [user]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="display text-4xl">Account</h1>
        <p className="mt-6 border border-dashed border-steel-light p-6 font-mono text-xs leading-relaxed text-silver">
          Auth is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
          to enable accounts. See the project README for setup.
        </p>
      </div>
    );
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="label-caps text-silver">Checking credentials…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-12">
      <p className="label-caps text-blush">Rider Profile</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">My Garage</h1>

      <div className="mt-10 grid gap-8 md:grid-cols-[280px_1fr]">
        <div className="h-fit border border-steel bg-carbon p-6">
          <p className="label-caps text-silver">Signed in as</p>
          <p className="mt-2 break-all font-mono text-sm font-bold text-offwhite">{user.email}</p>
          <p className="label-caps mt-4 text-silver">Member since</p>
          <p className="mt-1 font-mono text-sm text-chrome">
            {new Date(user.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
          </p>
          <button
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="display mt-6 w-full border-2 border-steel-light py-2 text-sm text-chrome hover:border-ember hover:text-ember"
          >
            Sign Out
          </button>
        </div>

        <div>
          <h2 className="display text-2xl">Order History</h2>
          {!ordersLoaded ? (
            <p className="label-caps mt-6 text-silver">Loading orders…</p>
          ) : orders.length === 0 ? (
            <div className="mt-6 border border-steel bg-carbon p-10 text-center">
              <p className="text-silver">No orders yet. Your garage is waiting.</p>
              <Link
                href="/shop"
                className="display glow-red mt-6 inline-block bg-crimson px-6 py-2 text-offwhite hover:bg-ember"
              >
                Shop the Fleet
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 border border-steel bg-carbon p-5">
                  <div>
                    <p className="font-mono text-xs text-silver">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="mt-1 text-sm text-chrome">
                      {new Date(order.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
                      {order.discount_code && (
                        <span className="ml-2 font-mono text-xs text-success">({order.discount_code})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="label-caps bg-carbon-high px-2 py-1 text-chrome">{order.status}</span>
                    <span className="font-mono font-bold text-ember">{money(order.total_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
