"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOrderStatus } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";

function SuccessContent() {
  const params = useSearchParams();
  const orderId = params.get("order") ?? "";
  const { clear } = useCart();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const cleared = useRef(false);

  // Payment is done (or in flight) — the cart's job is over.
  useEffect(() => {
    if (!cleared.current) {
      cleared.current = true;
      clear();
    }
  }, [clear]);

  // Stripe confirms via webhook, so the order can lag a few seconds behind
  // the redirect. Poll briefly until it flips to paid.
  useEffect(() => {
    if (!orderId) {
      setChecking(false);
      return;
    }
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      const data = await fetchOrderStatus(orderId);
      if (stopped) return;
      if (data) setOrder(data);
      attempts += 1;
      if (data?.paymentStatus === "paid" || attempts >= 12) {
        setChecking(false);
      } else {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  const paid = order?.paymentStatus === "paid";
  const failed = order?.status === "cancelled";

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-12">
      <p
        className={`display mx-auto flex h-16 w-16 items-center justify-center text-3xl text-offwhite ${
          paid ? "glow-red bg-crimson" : "border-2 border-steel-light bg-carbon"
        }`}
      >
        {paid ? "✓" : failed ? "✕" : "…"}
      </p>
      <h1 className="display mt-8 text-4xl md:text-6xl">
        {paid ? (
          <>
            Order <span className="text-ember">Confirmed</span>
          </>
        ) : failed ? (
          <>
            Payment <span className="text-ember">Not Completed</span>
          </>
        ) : checking ? (
          <>
            Confirming <span className="text-ember">Payment…</span>
          </>
        ) : (
          <>
            Payment <span className="text-ember">Processing</span>
          </>
        )}
      </h1>
      <p className="mt-6 text-silver">
        {paid
          ? "Your machine is being prepped in the garage. A confirmation email is on its way."
          : failed
            ? "The payment was cancelled or declined. Your card was not charged."
            : "Hang tight — we're waiting for the payment provider to confirm. This page updates automatically, and you'll get an email the moment it lands."}
      </p>

      {order && (
        <dl className="mx-auto mt-10 max-w-md space-y-3 border border-steel bg-carbon p-8 text-left">
          <div className="spec-row">
            <dt className="label-caps text-silver">Order ID</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-sm font-bold">#{order.id.slice(0, 8).toUpperCase()}</dd>
          </div>
          <div className="spec-row">
            <dt className="label-caps text-silver">Status</dt>
            <span className="spec-leader" />
            <dd className={`font-mono text-sm font-bold ${paid ? "text-success" : "text-chrome"}`}>
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

      <div className="mt-10 flex justify-center gap-4">
        <Link href="/shop" className="display glow-red bg-crimson px-8 py-3 text-offwhite hover:bg-ember">
          Keep Shopping
        </Link>
        <Link
          href="/account"
          className="display border-2 border-chrome px-8 py-3 text-chrome hover:border-ember hover:text-ember"
        >
          View Account
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
