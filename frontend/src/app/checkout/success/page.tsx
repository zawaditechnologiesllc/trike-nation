"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOrderStatus, syncOrderPayment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { DELIVERY_WINDOW } from "@/lib/brand";
import { money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";
import { orderReference } from "@/shared/core/orders";

function SuccessContent() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const sessionId = params.get("session_id") ?? "";
  const { clear } = useCart();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const cleared = useRef(false);
  const synced = useRef(false);

  // Payment is done (or in flight) — the cart's job is over.
  useEffect(() => {
    if (!cleared.current) {
      cleared.current = true;
      clear();
    }
  }, [clear]);

  /**
   * There is no Stripe webhook. Coming back from Checkout is what tells the
   * backend to read the session straight from Stripe and record what it says.
   * That records the payment for review — an admin confirms it afterwards.
   */
  useEffect(() => {
    if (!orderId || synced.current) {
      if (!orderId) setChecking(false);
      return;
    }
    synced.current = true;
    let stopped = false;

    (async () => {
      await syncOrderPayment(orderId, sessionId || undefined);
      if (stopped) return;
      const data = await fetchOrderStatus(orderId);
      if (stopped) return;
      if (data) setOrder(data);
      setChecking(false);
    })();

    return () => {
      stopped = true;
    };
  }, [orderId, sessionId]);

  const received = order ? order.status !== "pending_payment" : false;
  const confirmed = order?.paymentStatus === "paid";
  const failed = order?.status === "cancelled";

  const heading = confirmed
    ? "Payment Confirmed"
    : failed
      ? "Payment Not Completed"
      : received
        ? "Payment Received"
        : checking
          ? "Checking with Stripe…"
          : "Payment Pending";

  const blurb = confirmed
    ? "Your machine is in the build queue. A confirmation email is on its way."
    : failed
      ? "The payment was cancelled or declined. Your card was not charged."
      : received
        ? `Stripe has your payment. We verify every payment by hand — usually inside one business day — and email you the moment it's confirmed. Delivery then runs ${DELIVERY_WINDOW.minDays}–${DELIVERY_WINDOW.maxDays} days, with progress updates on day 7, 12, and 20.`
        : checking
          ? "Reading your payment straight from Stripe. This takes a second."
          : "We couldn't read the payment from Stripe just yet. If your card was charged, it will show up in our queue — check your email, or contact support with your order number.";

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-12">
      <p
        className={`display mx-auto flex h-16 w-16 items-center justify-center text-3xl text-offwhite ${
          confirmed ? "glow-red bg-crimson" : "border-2 border-steel-light bg-carbon"
        }`}
      >
        {confirmed ? "✓" : failed ? "✕" : received ? "◷" : "…"}
      </p>
      <h1 className="display mt-8 text-4xl md:text-6xl">
        {heading.split(" ").slice(0, -1).join(" ")}{" "}
        <span className="text-ember">{heading.split(" ").slice(-1)}</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-silver">{blurb}</p>

      {order && (
        <dl className="mx-auto mt-10 max-w-md space-y-3 border border-steel bg-carbon p-8 text-left">
          <div className="spec-row">
            <dt className="label-caps text-silver">Order ID</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-sm font-bold">{orderReference(order.id, order.orderNumber)}</dd>
          </div>
          <div className="spec-row">
            <dt className="label-caps text-silver">Status</dt>
            <span className="spec-leader" />
            <dd className={`font-mono text-sm font-bold ${confirmed ? "text-success" : "text-amber"}`}>
              {(order.status ?? "").replace(/_/g, " ").toUpperCase()}
            </dd>
          </div>
          {order.discountCode && (
            <div className="spec-row">
              <dt className="label-caps text-silver">Discount</dt>
              <span className="spec-leader" />
              <dd className="font-mono text-sm font-bold text-ember">
                {order.discountCode} (-{money(order.discountCents)})
              </dd>
            </div>
          )}
          <div className="spec-row">
            <dt className="label-caps text-silver">Total</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-sm font-bold text-ember">{money(order.totalCents)}</dd>
          </div>
          <div className="spec-row">
            <dt className="label-caps text-silver">Shipping</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-sm font-bold text-success">FREE · WORLDWIDE</dd>
          </div>
        </dl>
      )}

      {!user && orderId && (
        <p className="mx-auto mt-8 max-w-md border border-dashed border-steel-light p-5 font-mono text-xs leading-relaxed text-silver">
          Ordered as a guest? Create an account with the same email address and this order lands in
          your garage automatically — we&apos;ll email you the link once payment is confirmed.{" "}
          <Link href={`/signup?order=${orderId}`} className="text-ember hover:text-blush">
            Create it now
          </Link>
          .
        </p>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-4">
        {orderId && (
          <Link
            href={`/orders/${orderId}`}
            className="display glow-red bg-crimson px-8 py-3 text-offwhite hover:bg-ember"
          >
            Track This Order
          </Link>
        )}
        <Link
          href="/shop"
          className="display border-2 border-chrome px-8 py-3 text-chrome hover:border-ember hover:text-ember"
        >
          Keep Shopping
        </Link>
        <Link
          href="/account"
          className="display border-2 border-chrome px-8 py-3 text-chrome hover:border-ember hover:text-ember"
        >
          My Garage
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
