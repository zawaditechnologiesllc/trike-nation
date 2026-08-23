"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { fetchOrderStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DELIVERY_WINDOW, EMAILS } from "@/lib/brand";
import { money } from "@/lib/format";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import OrderTimeline from "@/components/OrderTimeline";
import type { OrderSummary } from "@/lib/types";
import { orderReference } from "@/shared/core/orders";

/**
 * Order tracking, reachable by anyone holding the order's uuid — that is what
 * the confirmation email links to, so guests can follow an order without an
 * account. The API returns a safe subset only (no address, masked email).
 */
export default function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  const load = useCallback(async () => {
    const data = await fetchOrderStatus(id);
    setOrder(data);
    setState(data ? "ready" : "missing");
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <p className="label-caps text-silver">Loading order…</p>
      </div>
    );
  }

  if (state === "missing" || !order) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center">
        <h1 className="display text-4xl">
          Order <span className="text-ember">Not Found</span>
        </h1>
        <p className="mt-6 font-mono text-sm text-silver">
          That order link doesn&apos;t match anything. Check the link in your confirmation email, or
          write to{" "}
          <a href={`mailto:${EMAILS.orders}`} className="text-ember hover:text-blush">
            {EMAILS.orders}
          </a>
          .
        </p>
        <Link href="/shop" className="display glow-red mt-10 inline-block bg-crimson px-8 py-3 text-offwhite hover:bg-ember">
          Back to the Shop
        </Link>
      </div>
    );
  }

  const awaitingConfirmation = order.status === "awaiting_confirmation";
  const paidDays = order.paidAt
    ? Math.floor((Date.now() - new Date(order.paidAt).getTime()) / 86_400_000)
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 md:px-12">
      <p className="label-caps text-blush">Order Tracking</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="display text-4xl md:text-5xl">{orderReference(order.id, order.orderNumber)}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      {order.emailHint && (
        <p className="mt-2 font-mono text-xs text-silver">Placed with {order.emailHint}</p>
      )}

      {awaitingConfirmation && (
        <p className="mt-6 border border-amber/50 bg-amber/10 p-4 font-mono text-xs leading-relaxed text-amber">
          Stripe has your payment. We confirm every payment by hand — usually inside one business
          day — and email you the moment it clears.
        </p>
      )}

      {order.paidAt && (
        <p className="mt-6 border border-steel bg-carbon p-4 font-mono text-xs leading-relaxed text-silver">
          Payment confirmed{" "}
          <span className="text-chrome">
            {new Date(order.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
          </span>
          {paidDays !== null && <> · day {paidDays} of the {DELIVERY_WINDOW.minDays}–{DELIVERY_WINDOW.maxDays} day window</>}
          . Progress emails land on day 7, 12, and 20.
        </p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">Items</h2>
            <div className="mt-4 space-y-3">
              {(order.items ?? []).map((item) => (
                <div
                  key={`${item.slug ?? item.name}-${item.qty}`}
                  className="flex justify-between border-b border-steel/60 pb-3 text-sm"
                >
                  <span className="text-chrome">
                    {item.name} <span className="font-mono text-xs text-silver">× {item.qty}</span>
                  </span>
                  <span className="font-mono font-bold">{money(item.unitCents * item.qty)}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-2">
              <div className="spec-row">
                <dt className="label-caps text-silver">Subtotal</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm">{money(order.subtotalCents)}</dd>
              </div>
              {order.discountCents > 0 && (
                <div className="spec-row">
                  <dt className="label-caps text-silver">
                    Discount {order.discountCode && `(${order.discountCode})`}
                  </dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm text-ember">-{money(order.discountCents)}</dd>
                </div>
              )}
              <div className="spec-row">
                <dt className="display text-lg">Total</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-lg font-bold text-ember">{money(order.totalCents)}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">History</h2>
            <div className="mt-4">
              <OrderTimeline entries={order.timeline ?? []} />
            </div>
          </div>
        </div>

        <aside className="h-fit space-y-4 border border-steel bg-carbon p-6">
          {order.trackingNumber ? (
            <div>
              <p className="label-caps text-silver">Tracking number</p>
              <p className="mt-2 break-all font-mono text-sm font-bold text-ember">
                {order.trackingNumber}
              </p>
            </div>
          ) : (
            <p className="font-mono text-xs leading-relaxed text-silver">
              A tracking number appears here — and lands in your inbox — the moment the crate leaves
              the dock.
            </p>
          )}

          {!user && !order.hasAccount && (
            <div className="border-t border-steel pt-4">
              <p className="label-caps text-silver">Keep it in one place</p>
              <p className="mt-2 font-mono text-xs leading-relaxed text-silver">
                Create an account with the email you ordered with and this order attaches to it
                automatically.
              </p>
              <Link
                href={`/signup?order=${order.id}`}
                className="display glow-red mt-4 block bg-crimson py-2 text-center text-sm text-offwhite hover:bg-ember"
              >
                Create Account
              </Link>
            </div>
          )}

          <div className="border-t border-steel pt-4">
            <p className="label-caps text-silver">Questions</p>
            <a
              href={`mailto:${EMAILS.orders}?subject=${encodeURIComponent(`Order ${orderReference(order.id, order.orderNumber)}`)}`}
              className="mt-2 block break-all font-mono text-xs text-ember hover:text-blush"
            >
              {EMAILS.orders}
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
