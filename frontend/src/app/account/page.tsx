"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchAccountOrders } from "@/lib/api";
import { DELIVERY_WINDOW } from "@/lib/brand";
import { money } from "@/lib/format";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import type { AccountOrder } from "@/lib/types";
import { orderReference } from "@/shared/core/orders";

function AccountContent() {
  const { user, session, loading, enabled, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const justClaimed = params.get("order");
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    if (!loading && enabled && !user) router.replace("/login");
  }, [loading, enabled, user, router]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    // The API claims guest orders placed with this address before returning,
    // so an order made before signing up shows up here on the first load.
    setOrders(await fetchAccountOrders(session.access_token));
    setOrdersLoaded(true);
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="display text-4xl">Account</h1>
        <p className="mt-6 border border-dashed border-steel-light p-6 font-mono text-xs leading-relaxed text-silver">
          Accounts are temporarily unavailable. Please try again shortly or contact support.
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

  const spentCents = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((total, o) => total + o.totalCents, 0);
  const inFlight = orders.filter((o) => ["paid", "processing", "shipped"].includes(o.status)).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-12">
      <p className="label-caps text-blush">Rider Profile</p>
      <h1 className="display mt-2 text-4xl md:text-5xl">My Garage</h1>

      {justClaimed && (
        <p className="mt-6 border border-success/50 bg-success/10 p-4 font-mono text-xs text-success">
          Order {orderReference(justClaimed)} is now linked to this account.
        </p>
      )}

      <div className="mt-10 grid gap-8 md:grid-cols-[280px_1fr]">
        <div className="h-fit space-y-4 border border-steel bg-carbon p-6">
          <div>
            <p className="label-caps text-silver">Signed in as</p>
            <p className="mt-2 break-all font-mono text-sm font-bold text-offwhite">{user.email}</p>
          </div>
          <div>
            <p className="label-caps text-silver">Member since</p>
            <p className="mt-1 font-mono text-sm text-chrome">
              {new Date(user.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-steel pt-4">
            <div>
              <p className="label-caps text-silver">Orders</p>
              <p className="mt-1 font-mono text-lg font-bold text-offwhite">{orders.length}</p>
            </div>
            <div>
              <p className="label-caps text-silver">In transit</p>
              <p className="mt-1 font-mono text-lg font-bold text-blush">{inFlight}</p>
            </div>
            <div className="col-span-2">
              <p className="label-caps text-silver">Lifetime spend</p>
              <p className="mt-1 font-mono text-lg font-bold text-ember">{money(spentCents)}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.push("/");
            }}
            className="display mt-2 w-full border-2 border-steel-light py-2 text-sm text-chrome hover:border-ember hover:text-ember"
          >
            Sign Out
          </button>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="display text-2xl">Order History</h2>
            <button
              onClick={() => void load()}
              className="label-caps text-silver hover:text-ember"
              type="button"
            >
              Refresh
            </button>
          </div>

          {!ordersLoaded ? (
            <p className="label-caps mt-6 text-silver">Loading orders…</p>
          ) : orders.length === 0 ? (
            <div className="mt-6 border border-steel bg-carbon p-10 text-center">
              <p className="text-silver">No orders yet. Your garage is waiting.</p>
              <p className="mt-3 font-mono text-xs text-silver">
                Ordered as a guest with a different email? Orders attach to the account that uses the
                same address.
              </p>
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
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block border border-steel bg-carbon p-5 transition-colors hover:border-crimson"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-silver">
                        {orderReference(order.id, order.orderNumber)}
                      </p>
                      <p className="mt-1 text-sm text-chrome">
                        {new Date(order.createdAt ?? "").toLocaleDateString("en-US", {
                          dateStyle: "medium",
                        })}
                        {order.discountCode && (
                          <span className="ml-2 font-mono text-xs text-success">
                            ({order.discountCode})
                          </span>
                        )}
                      </p>
                      <p className="mt-1 truncate text-xs text-silver">
                        {order.items.map((i) => `${i.name} × ${i.qty}`).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <OrderStatusBadge status={order.status} />
                      <span className="font-mono font-bold text-ember">{money(order.totalCents)}</span>
                    </div>
                  </div>
                  {order.trackingNumber && (
                    <p className="mt-3 font-mono text-xs text-silver">
                      Tracking: <span className="text-chrome">{order.trackingNumber}</span>
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}

          <p className="mt-8 font-mono text-xs leading-relaxed text-silver">
            Delivery runs {DELIVERY_WINDOW.minDays}–{DELIVERY_WINDOW.maxDays} days from confirmed
            payment. We email you at every status change, plus progress updates on day 7, 12, and 20.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountContent />
    </Suspense>
  );
}
