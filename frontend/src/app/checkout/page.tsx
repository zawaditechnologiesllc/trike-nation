"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { fetchPaymentsConfig, placeOrder, validateDiscount } from "@/lib/api";
import { DELIVERY_WINDOW } from "@/lib/brand";
import type { PaymentsConfig } from "@/lib/types";

const STEPS = ["01 Shipping", "02 Payment", "03 Review"];

export default function CheckoutPage() {
  const { items, subtotalCents } = useCart();
  const { user, session } = useAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    email: "",
  });
  const [payments, setPayments] = useState<PaymentsConfig | null>(null);
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState(0);
  const [codeMsg, setCodeMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    fetchPaymentsConfig().then(setPayments);
    setCancelled(new URLSearchParams(window.location.search).get("cancelled") === "1");
  }, []);

  useEffect(() => {
    if (user?.email) setForm((f) => (f.email ? f : { ...f, email: user.email! }));
  }, [user]);

  const discountCents = Math.round((subtotalCents * percentOff) / 100);
  const totalCents = subtotalCents - discountCents;
  const stripeReady = payments?.stripe === true;
  const noProviders = payments !== null && !payments.stripe;
  const deliveryDays = payments?.deliveryDays ?? {
    min: DELIVERY_WINDOW.minDays,
    max: DELIVERY_WINDOW.maxDays,
  };

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value });
  }

  async function applyCode() {
    const pct = await validateDiscount(code);
    if (pct) {
      setPercentOff(pct);
      setCodeMsg(`✓ ${pct}% discount applied`);
    } else {
      setPercentOff(0);
      setCodeMsg("✗ Invalid or expired code");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0 || !stripeReady) return;
    setSubmitting(true);
    setError("");
    try {
      const order = await placeOrder({
        items,
        shipping: form,
        discountCode: percentOff ? code.trim().toUpperCase() : undefined,
        accessToken: session?.access_token,
      });
      if (order.redirectUrl) {
        // Off to Stripe Checkout. The cart is cleared on the success page,
        // after payment — so a cancelled payment keeps it.
        window.location.assign(order.redirectUrl);
        return;
      }
      throw new Error("Payment session did not return a redirect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed. Try again.");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-12">
        <h1 className="display text-4xl text-blush">Checkout</h1>
        <p className="mt-6 text-silver">Nothing staged for checkout yet.</p>
        <Link
          href="/shop"
          className="display glow-red mt-8 inline-block bg-crimson px-8 py-3 text-offwhite hover:bg-ember"
        >
          Shop the Fleet
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-12">
      <h1 className="display text-4xl text-blush md:text-6xl">Checkout</h1>
      <div className="mt-4 flex items-center gap-4">
        {STEPS.map((step, i) => (
          <span key={step} className="flex items-center gap-4">
            <span className={`label-caps ${i === 0 ? "text-ember" : "text-silver"}`}>{step}</span>
            {i < STEPS.length - 1 && <span className="hidden h-px w-10 bg-steel sm:block" />}
          </span>
        ))}
      </div>

      {cancelled && (
        <p className="mt-6 border border-steel-light bg-carbon p-4 font-mono text-xs text-chrome">
          Payment cancelled — your build is still staged below. Pick a payment method to try again.
        </p>
      )}

      <form onSubmit={submit} className="mt-12 grid gap-10 lg:grid-cols-[1fr_420px]">
        <div className="space-y-8">
          {/* Shipping */}
          <fieldset className="border border-steel bg-carbon p-6 md:p-8">
            <legend className="display border-l-4 border-crimson px-3 text-2xl">Shipping Information</legend>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <label className="block">
                <span className="label-caps text-silver">First Name</span>
                <input required className="input-tech mt-2" placeholder="e.g. John" value={form.firstName} onChange={set("firstName")} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Last Name</span>
                <input required className="input-tech mt-2" placeholder="e.g. Doe" value={form.lastName} onChange={set("lastName")} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label-caps text-silver">Street Address</span>
                <input required className="input-tech mt-2" placeholder="House number and street name" value={form.address} onChange={set("address")} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">City</span>
                <input required className="input-tech mt-2" placeholder="City" value={form.city} onChange={set("city")} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">ZIP Code</span>
                <input required className="input-tech mt-2" placeholder="00000" value={form.zip} onChange={set("zip")} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Phone Number</span>
                <input required className="input-tech mt-2" placeholder="+1 (000) 000-0000" value={form.phone} onChange={set("phone")} />
              </label>
              <label className="block">
                <span className="label-caps text-silver">Email</span>
                <input
                  required
                  type="email"
                  className="input-tech mt-2"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={set("email")}
                />
              </label>
            </div>
          </fieldset>

          {/* Payment */}
          <fieldset className="border border-steel bg-carbon p-6 md:p-8">
            <legend className="display border-l-4 border-crimson px-3 text-2xl">Payment Method</legend>
            {payments === null ? (
              <p className="label-caps mt-6 text-silver">Loading payment methods…</p>
            ) : noProviders ? (
              <p className="mt-6 border border-crimson bg-crimson/10 p-4 font-mono text-xs text-ember">
                Online payment is temporarily unavailable. Please try again shortly or contact
                support to complete your order.
              </p>
            ) : (
              <div className="mt-6 border border-crimson bg-night px-4 py-4">
                <p className="label-caps text-offwhite">Card · Stripe Checkout</p>
                <p className="mt-2 font-mono text-xs text-silver">
                  Visa, Mastercard, Amex, Apple Pay, and Google Pay — handled on Stripe&apos;s hosted
                  page. Card details never touch our servers.
                </p>
              </div>
            )}
            <div className="mt-4 space-y-2 border-l-2 border-steel-light pl-4">
              <p className="label-caps text-silver">
                Every payment is confirmed by a person, not a bot
              </p>
              <p className="font-mono text-xs leading-relaxed text-silver">
                After you pay we verify the payment by hand — usually inside one business day — then
                email you the confirmation. Delivery runs {deliveryDays.min}–{deliveryDays.max} days
                from that confirmation, with progress emails on day 7, 12, and 20.
              </p>
            </div>
          </fieldset>

          {error && (
            <p className="border border-crimson bg-crimson/10 p-4 font-mono text-sm text-ember">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !stripeReady}
            className="display glow-red w-full bg-crimson py-5 text-xl text-offwhite transition-colors hover:bg-ember disabled:opacity-50"
          >
            {submitting ? "Starting Secure Payment…" : `Pay ${money(totalCents)} with Stripe`}
          </button>
        </div>

        {/* Your Build */}
        <aside className="h-fit space-y-6">
          <div className="border border-steel bg-carbon p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-2xl">Your Build</h2>
              <span className="label-caps text-blush">
                ({items.reduce((n, i) => n + i.qty, 0)} item{items.reduce((n, i) => n + i.qty, 0) > 1 ? "s" : ""})
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {items.map((item) => (
                <div key={item.slug} className="flex gap-4 border-b border-steel/60 pb-4">
                  <Image src={item.image} alt={item.name} width={96} height={54} className="border border-steel" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="mt-1 font-mono text-xs text-silver">QTY: {String(item.qty).padStart(2, "0")}</p>
                  </div>
                  <p className="font-mono text-sm font-bold text-ember">{money(item.priceCents * item.qty)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="label-caps text-silver">Discount Code</p>
              <div className="mt-2 flex gap-2">
                <input
                  className="input-tech flex-1"
                  placeholder="BIKEMIKE26"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  type="button"
                  onClick={applyCode}
                  className="label-caps border border-steel-light px-4 text-chrome hover:border-ember hover:text-ember"
                >
                  Apply
                </button>
              </div>
              {codeMsg && (
                <p className={`mt-2 font-mono text-xs ${percentOff ? "text-success" : "text-ember"}`}>{codeMsg}</p>
              )}
            </div>

            <dl className="mt-6 space-y-3 border-t border-steel pt-6">
              <div className="spec-row">
                <dt className="label-caps text-silver">Subtotal</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm font-bold">{money(subtotalCents)}</dd>
              </div>
              {percentOff > 0 && (
                <div className="spec-row">
                  <dt className="label-caps text-silver">Discount ({code.trim().toUpperCase()})</dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm font-bold text-ember">-{money(discountCents)}</dd>
                </div>
              )}
              <div className="spec-row">
                <dt className="label-caps text-silver">Shipping</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm font-bold text-success">FREE</dd>
              </div>
              <div className="spec-row pt-2">
                <dt className="display text-xl">Total</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-2xl font-bold text-ember">{money(totalCents)}</dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-steel bg-carbon p-5 text-center">
              <p className="text-ember">◈</p>
              <p className="label-caps mt-2 text-chrome">Secure Payment</p>
            </div>
            <div className="border border-steel bg-carbon p-5 text-center">
              <p className="text-ember">▣</p>
              <p className="label-caps mt-2 text-chrome">
                {deliveryDays.min}–{deliveryDays.max} Day Delivery
              </p>
            </div>
          </div>

          {!user && (
            <p className="font-mono text-xs text-silver">
              Checking out as guest — that&apos;s fine. We&apos;ll email you a link to create an
              account with this address once payment is confirmed, and the order attaches to it
              automatically. Prefer to{" "}
              <Link href="/login" className="text-ember hover:text-blush">
                sign in
              </Link>{" "}
              first? That works too.
            </p>
          )}
        </aside>
      </form>
    </div>
  );
}
