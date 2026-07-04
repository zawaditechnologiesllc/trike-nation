"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { placeOrder, validateDiscount } from "@/lib/api";

const STEPS = ["01 Shipping", "02 Payment", "03 Review"];

export default function CheckoutPage() {
  const { items, subtotalCents, clear } = useCart();
  const { user, session } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    email: user?.email ?? "",
  });
  const [payment, setPayment] = useState<"card" | "paypal">("card");
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState(0);
  const [codeMsg, setCodeMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const discountCents = Math.round((subtotalCents * percentOff) / 100);
  const totalCents = subtotalCents - discountCents;

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
    if (items.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const order = await placeOrder({
        items,
        shipping: { ...form, email: form.email || user?.email || "" },
        discountCode: percentOff ? code.trim().toUpperCase() : undefined,
        accessToken: session?.access_token,
      });
      clear();
      const qs = new URLSearchParams({
        id: order.id,
        total: String(order.totalCents),
        ...(order.demo ? { demo: "1" } : {}),
      });
      router.push(`/checkout/success?${qs}`);
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
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(
                [
                  { id: "card", label: "Secure Card Payment" },
                  { id: "paypal", label: "PayPal" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPayment(opt.id)}
                  className={`label-caps border px-4 py-4 text-left transition-colors ${
                    payment === opt.id
                      ? "border-crimson bg-night text-offwhite"
                      : "border-steel text-silver hover:border-crimson"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="label-caps mt-4 text-silver">
              Payment is captured after order review — no charge is made on this step.
            </p>
          </fieldset>

          {error && (
            <p className="border border-crimson bg-crimson/10 p-4 font-mono text-sm text-ember">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="display glow-red w-full bg-crimson py-5 text-xl text-offwhite transition-colors hover:bg-ember disabled:opacity-50"
          >
            {submitting ? "Placing Order…" : "Place Order"}
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
              <p className="label-caps mt-2 text-chrome">Fast Delivery</p>
            </div>
          </div>

          {!user && (
            <p className="font-mono text-xs text-silver">
              Checking out as guest.{" "}
              <Link href="/login" className="text-ember hover:text-blush">
                Sign in
              </Link>{" "}
              to track this order in your account.
            </p>
          )}
        </aside>
      </form>
    </div>
  );
}
