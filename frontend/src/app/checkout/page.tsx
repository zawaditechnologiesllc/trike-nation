"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { fetchPaymentsConfig, placeOrder, validateDiscount } from "@/lib/api";
import { deliveryWindowLabel } from "@shared/core/delivery";
import { validateAddress, type AddressInput, type FieldError } from "@shared/core/validation";
import type { PaymentsConfig } from "@/lib/types";

const STEPS = ["01 Shipping", "02 Payment", "03 Review"];

export default function CheckoutPage() {
  const { items, subtotalCents } = useCart();
  const { user, session } = useAuth();

  const [form, setForm] = useState<AddressInput>({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", address2: "", city: "", region: "", postalCode: "", country: "",
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [payments, setPayments] = useState<PaymentsConfig | null>(null);
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState(0);
  const [codeMsg, setCodeMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [AddressFields, setAddressFields] = useState<React.ComponentType<{
    value: AddressInput;
    onChange: (next: AddressInput) => void;
    errors: FieldError[];
  }> | null>(null);

  useEffect(() => {
    fetchPaymentsConfig().then(setPayments);
    setCancelled(new URLSearchParams(window.location.search).get("cancelled") === "1");
    // The full ISO country list is large; keep it out of the first paint.
    void import("@/components/AddressFields").then((mod) => setAddressFields(() => mod.default));
  }, []);

  useEffect(() => {
    if (user?.email) setForm((f) => (f.email ? f : { ...f, email: user.email! }));
  }, [user]);

  const discountCents = Math.round((subtotalCents * percentOff) / 100);
  const totalCents = subtotalCents - discountCents;
  const stripeReady = payments?.stripe === true;
  const noProviders = payments !== null && !payments.stripe;
  const deliveryLabel = deliveryWindowLabel(form.country);

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

    // The browser check is a courtesy — it saves a round trip. The identical
    // module runs on the server, and that one decides.
    const localErrors = validateAddress(form);
    setErrors(localErrors);
    if (localErrors.length > 0) {
      setError("Check the highlighted fields.");
      return;
    }

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
        // after payment — a buyer who bounces off the payment page keeps it.
        window.location.assign(order.redirectUrl);
        return;
      }
      throw new Error("Payment session did not return a redirect");
    } catch (err) {
      const failure = err as Error & { fieldErrors?: FieldError[] };
      if (failure.fieldErrors?.length) setErrors(failure.fieldErrors);
      setError(failure.message || "Order failed. Try again.");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-12">
        <h1 className="display text-4xl text-on-secondary-fixed">Checkout</h1>
        <p className="mt-6 text-on-surface-muted">Nothing staged for checkout yet.</p>
        <Link href="/shop" className="display glow-red mt-8 inline-block bg-primary px-8 py-3 text-on-primary hover:bg-secondary">
          Shop the Fleet
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-12">
      <h1 className="display text-4xl text-on-secondary-fixed md:text-6xl">Checkout</h1>
      <div className="mt-4 flex items-center gap-4">
        {STEPS.map((step, i) => (
          <span key={step} className="flex items-center gap-4">
            <span className={`label-caps ${i === 0 ? "text-secondary" : "text-on-surface-muted"}`}>{step}</span>
            {i < STEPS.length - 1 && <span className="hidden h-px w-10 bg-outline sm:block" />}
          </span>
        ))}
      </div>

      {cancelled && (
        <p className="mt-6 border border-outline-variant bg-surface-container p-4 font-mono text-xs text-on-surface-variant">
          Payment cancelled — your build is still staged below. Nothing was charged.
        </p>
      )}

      <form onSubmit={submit} className="mt-12 grid gap-10 lg:grid-cols-[1fr_420px]">
        <div className="space-y-8">
          <fieldset className="border border-outline bg-surface-container p-6 md:p-8">
            <legend className="display border-l-4 border-primary px-3 text-2xl">Shipping Information</legend>
            {AddressFields ? (
              <AddressFields value={form} onChange={setForm} errors={errors} />
            ) : (
              <p className="label-caps mt-6 text-on-surface-muted">Loading address form…</p>
            )}
          </fieldset>

          <fieldset className="border border-outline bg-surface-container p-6 md:p-8">
            <legend className="display border-l-4 border-primary px-3 text-2xl">Payment Method</legend>
            {payments === null ? (
              <p className="label-caps mt-6 text-on-surface-muted">Loading payment methods…</p>
            ) : noProviders ? (
              <p className="mt-6 border border-primary bg-primary/10 p-4 font-mono text-xs text-error">
                Online payment is temporarily unavailable. Please try again shortly or contact support.
              </p>
            ) : (
              <div className="mt-6 border border-primary bg-surface px-4 py-4">
                <p className="label-caps text-on-surface">Card · Stripe Checkout</p>
                <p className="mt-2 font-mono text-xs text-on-surface-muted">
                  Visa, Mastercard, Amex, Apple Pay and Google Pay — handled on Stripe&apos;s hosted
                  page. Card details never touch our servers.
                </p>
              </div>
            )}
            <div className="mt-4 space-y-2 border-l-2 border-outline-variant pl-4">
              <p className="label-caps text-on-surface-muted">Every payment is confirmed by a person</p>
              <p className="font-mono text-xs leading-relaxed text-on-surface-muted">
                After you pay we verify the payment by hand — usually inside one business day — then
                email you the confirmation. Delivery to{" "}
                {form.country ? "your country" : "most destinations"} then runs{" "}
                <strong className="text-on-surface-variant">{deliveryLabel}</strong>, with progress
                emails on the way.
              </p>
            </div>
          </fieldset>

          {error && <p className="border border-primary bg-primary/10 p-4 font-mono text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !stripeReady}
            className="display glow-red w-full bg-primary py-5 text-xl text-on-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {submitting ? "Starting Secure Payment…" : `Pay ${money(totalCents)} with Stripe`}
          </button>
        </div>

        <aside className="h-fit space-y-6">
          <div className="border border-outline bg-surface-container p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-2xl">Your Build</h2>
              <span className="label-caps text-on-secondary-fixed">
                ({items.reduce((n, i) => n + i.qty, 0)} item{items.reduce((n, i) => n + i.qty, 0) > 1 ? "s" : ""})
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {items.map((item) => (
                <div key={item.key} className="flex gap-4 border-b border-outline/60 pb-4">
                  <Image src={item.image} alt={item.name} width={96} height={54} className="border border-outline" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{item.name}</p>
                    {item.color && (
                      <p className="mt-0.5 font-mono text-xs text-on-secondary-fixed">{item.color}</p>
                    )}
                    <p className="mt-1 font-mono text-xs text-on-surface-muted">
                      QTY: {String(item.qty).padStart(2, "0")}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold text-secondary">{money(item.priceCents * item.qty)}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <p className="label-caps text-on-surface-muted">Discount Code</p>
              <div className="mt-2 flex gap-2">
                <input className="input-tech flex-1" placeholder="BIKEMIKE26" value={code} onChange={(e) => setCode(e.target.value)} />
                <button
                  type="button"
                  onClick={applyCode}
                  className="label-caps border border-outline-variant px-4 text-on-surface-variant hover:border-secondary hover:text-secondary"
                >
                  Apply
                </button>
              </div>
              {codeMsg && (
                <p className={`mt-2 font-mono text-xs ${percentOff ? "text-signal-positive" : "text-error"}`}>{codeMsg}</p>
              )}
            </div>

            <dl className="mt-6 space-y-3 border-t border-outline pt-6">
              <div className="spec-row">
                <dt className="label-caps text-on-surface-muted">Subtotal</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm font-bold">{money(subtotalCents)}</dd>
              </div>
              {percentOff > 0 && (
                <div className="spec-row">
                  <dt className="label-caps text-on-surface-muted">Discount ({code.trim().toUpperCase()})</dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm font-bold text-secondary">-{money(discountCents)}</dd>
                </div>
              )}
              <div className="spec-row">
                <dt className="label-caps text-on-surface-muted">Shipping</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm font-bold text-signal-positive">FREE</dd>
              </div>
              <div className="spec-row pt-2">
                <dt className="display text-xl">Total</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-2xl font-bold text-secondary">{money(totalCents)}</dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-outline bg-surface-container p-5 text-center">
              <p className="text-secondary">◈</p>
              <p className="label-caps mt-2 text-on-surface-variant">Secure Payment</p>
            </div>
            <div className="border border-outline bg-surface-container p-5 text-center">
              <p className="text-secondary">▣</p>
              <p className="label-caps mt-2 text-on-surface-variant">{deliveryLabel}</p>
            </div>
          </div>

          {!user && (
            <p className="font-mono text-xs text-on-surface-muted">
              Checking out as guest — that&apos;s fine. We&apos;ll email you a link to create an
              account with this address once payment is confirmed, and the order attaches to it
              automatically. Prefer to{" "}
              <Link href="/login" className="text-secondary hover:text-on-secondary-fixed">
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
