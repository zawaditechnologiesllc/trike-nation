"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { adminFetch, statusTone, ORDER_STATUSES, type AdminOrderDetail } from "@/lib/admin";
import { money } from "@/lib/format";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    adminFetch<AdminOrderDetail>(`/orders/${id}`)
      .then((data) => {
        setOrder(data);
        setStatus(data.status);
        setTracking(data.tracking_number ?? "");
        setNotes(data.admin_notes ?? "");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function save() {
    setSaving(true);
    setSaved("");
    setError("");
    try {
      await adminFetch(`/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, trackingNumber: tracking, adminNotes: notes }),
      });
      setSaved(
        status === "shipped" && order?.status !== "shipped"
          ? "Saved — shipping notification emailed to the customer."
          : "Saved.",
      );
      setOrder((o) => (o ? { ...o, status, tracking_number: tracking || null, admin_notes: notes || null } : o));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (error && !order) return <p className="font-mono text-sm text-ember">{error}</p>;
  if (!order) return <p className="label-caps text-silver">Loading order…</p>;

  return (
    <div>
      <Link href="/admin/orders" className="label-caps text-silver hover:text-ember">
        ← All orders
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="display text-3xl">#{order.id.slice(0, 8).toUpperCase()}</h1>
        <span className={`label-caps ${statusTone(order.status)}`}>{order.status.replace(/_/g, " ")}</span>
        <span className={`label-caps ${order.payment_status === "paid" ? "text-success" : "text-silver"}`}>
          {order.payment_provider ?? "no provider"} · {order.payment_status}
        </span>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">Items</h2>
            <div className="mt-4 space-y-3">
              {order.items.map((item) => (
                <div key={item.product_slug} className="flex justify-between border-b border-steel/60 pb-3 text-sm">
                  <span className="text-chrome">
                    {item.product_name} <span className="font-mono text-xs text-silver">× {item.qty}</span>
                  </span>
                  <span className="font-mono font-bold">{money(item.unit_price_cents * item.qty)}</span>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-2">
              <div className="spec-row">
                <dt className="label-caps text-silver">Subtotal</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-sm">{money(order.subtotal_cents)}</dd>
              </div>
              {order.discount_cents > 0 && (
                <div className="spec-row">
                  <dt className="label-caps text-silver">Discount {order.discount_code && `(${order.discount_code})`}</dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm text-ember">-{money(order.discount_cents)}</dd>
                </div>
              )}
              <div className="spec-row">
                <dt className="display text-lg">Total</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-lg font-bold text-ember">{money(order.total_cents)}</dd>
              </div>
            </dl>
            {order.payment_ref && (
              <p className="mt-4 break-all font-mono text-xs text-silver">Payment ref: {order.payment_ref}</p>
            )}
          </div>

          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">Shipping</h2>
            <p className="mt-4 text-sm leading-relaxed text-chrome">
              {order.shipping.firstName} {order.shipping.lastName}
              <br />
              {order.shipping.address}
              <br />
              {order.shipping.city}, {order.shipping.zip}
              <br />
              {order.shipping.phone} · {order.shipping.email}
            </p>
          </div>
        </div>

        <div className="h-fit space-y-5 border border-steel bg-carbon p-6">
          <h2 className="display text-xl">Fulfilment</h2>
          <label className="block">
            <span className="label-caps text-silver">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-tech mt-2">
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-caps text-silver">Tracking Number</span>
            <input
              className="input-tech mt-2"
              placeholder="Carrier tracking #"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label-caps text-silver">Internal Notes</span>
            <textarea
              rows={3}
              className="input-tech mt-2 resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <p className="font-mono text-xs text-silver">
            Setting status to <strong className="text-chrome">shipped</strong> emails the customer
            their tracking number automatically.
          </p>
          {error && <p className="font-mono text-xs text-ember">{error}</p>}
          {saved && <p className="font-mono text-xs text-success">{saved}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="display glow-red w-full bg-crimson py-3 text-offwhite hover:bg-ember disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
