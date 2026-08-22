"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  adminFetch,
  formatStatus,
  statusTone,
  ORDER_STATUSES,
  STATUS_HELP,
  type AdminOrderDetail,
} from "@/lib/admin";
import { money } from "@/lib/format";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<AdminOrderDetail>(`/orders/${id}`);
      setOrder(data);
      setStatus(data.status);
      setTracking(data.tracking_number ?? "");
      setNotes(data.admin_notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Wraps an admin action: clears messages, runs it, reloads the order. */
  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setSaved("");
    setError("");
    try {
      setSaved(await fn());
      await load();
      setCustomerNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy("");
    }
  }

  const save = () =>
    run("save", async () => {
      const result = await adminFetch<{ notified: boolean; accountInvited?: boolean; accountLinked?: boolean }>(
        `/orders/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            trackingNumber: tracking,
            adminNotes: notes,
            customerNote: customerNote || undefined,
            notify,
          }),
        },
      );
      return [
        "Saved.",
        result.notified ? "Customer notified by email." : notify ? "Email could not be sent." : "",
        result.accountLinked ? "Order linked to their account." : "",
        result.accountInvited ? "Account invitation emailed." : "",
      ]
        .filter(Boolean)
        .join(" ");
    });

  const confirmPayment = () =>
    run("confirm", async () => {
      const result = await adminFetch<{
        notified: boolean;
        accountLinked?: boolean;
        accountInvited?: boolean;
        alreadyPaid?: boolean;
      }>(`/orders/${id}/confirm-payment`, {
        method: "POST",
        body: JSON.stringify({ customerNote: customerNote || undefined, notify }),
      });
      if (result.alreadyPaid) return "This order was already marked paid.";
      return [
        "Payment confirmed.",
        result.notified ? "Confirmation emailed to the customer." : "",
        result.accountLinked
          ? "Order linked to their existing account."
          : result.accountInvited
            ? "They have no account — invitation emailed."
            : "",
      ]
        .filter(Boolean)
        .join(" ");
    });

  const syncStripe = () =>
    run("sync", async () => {
      const result = await adminFetch<{ stripeStatus: string; sessionStatus: string; amountMatches: boolean }>(
        `/orders/${id}/sync-stripe`,
        { method: "POST", body: "{}" },
      );
      return `Stripe reports payment "${result.stripeStatus}", session "${result.sessionStatus}"${
        result.amountMatches ? "" : " — AMOUNT MISMATCH, check before confirming"
      }.`;
    });

  const refund = () =>
    run("refund", async () => {
      if (!window.confirm("Refund this payment in Stripe and mark the order refunded?")) {
        throw new Error("Refund cancelled.");
      }
      const result = await adminFetch<{ refund: { amountCents: number } }>(`/orders/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ customerNote: customerNote || undefined }),
      });
      return `Refunded ${money(result.refund.amountCents)}. Customer notified.`;
    });

  const resendNotification = () =>
    run("notify", async () => {
      const result = await adminFetch<{ ok: boolean; error?: string }>(`/orders/${id}/notify`, {
        method: "POST",
        body: JSON.stringify({ customerNote: customerNote || undefined }),
      });
      return result.ok ? "Notification re-sent." : `Send failed: ${result.error ?? "unknown error"}`;
    });

  const linkAccount = (resendInvite: boolean) =>
    run("link", async () => {
      const result = await adminFetch<{ linked: boolean; invited: boolean }>(`/orders/${id}/link-account`, {
        method: "POST",
        body: JSON.stringify({ resendInvite }),
      });
      if (result.linked) return "Order linked to their account.";
      if (result.invited) return "Account invitation emailed.";
      return "Already invited — use “Re-send invite” to send it again.";
    });

  const sendDeliveryUpdate = (day: number) =>
    run("delivery", async () => {
      const result = await adminFetch<{ ok: boolean; day: number; error?: string }>(
        `/orders/${id}/delivery-update`,
        { method: "POST", body: JSON.stringify({ day }) },
      );
      return result.ok ? `Day ${result.day} update sent.` : `Send failed: ${result.error ?? "unknown"}`;
    });

  if (error && !order) return <p className="font-mono text-sm text-ember">{error}</p>;
  if (!order) return <p className="label-caps text-silver">Loading order…</p>;

  const isPaid = order.payment_status === "paid";
  const needsConfirmation = !isPaid && order.status !== "cancelled" && order.status !== "refunded";
  const stripeSaysPaid = order.stripe_reported_status === "paid";
  const amountMismatch =
    order.stripe_amount_total_cents != null && order.stripe_amount_total_cents !== order.total_cents;

  return (
    <div>
      <Link href="/admin/orders" className="label-caps text-silver hover:text-ember">
        ← All orders
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="display text-3xl">#{order.id.slice(0, 8).toUpperCase()}</h1>
        <span className={`label-caps ${statusTone(order.status)}`}>{formatStatus(order.status)}</span>
        <span className={`label-caps ${isPaid ? "text-success" : "text-silver"}`}>
          stripe · {order.payment_status}
        </span>
        {order.user_id ? (
          <span className="label-caps text-success">account linked</span>
        ) : order.account_invite_sent_at ? (
          <span className="label-caps text-amber">account invited</span>
        ) : (
          <span className="label-caps text-silver">guest</span>
        )}
      </div>

      {/* Manual payment confirmation — this is what replaces a Stripe webhook. */}
      {needsConfirmation && (
        <div className="mt-6 border border-crimson bg-crimson/10 p-5">
          <p className="label-caps text-blush">Payment needs confirming</p>
          <p className="mt-2 text-sm leading-relaxed text-chrome">
            {stripeSaysPaid
              ? `Stripe reports this payment succeeded${
                  order.stripe_amount_total_cents != null
                    ? ` for ${money(order.stripe_amount_total_cents)}`
                    : ""
                }. Check it in the Stripe dashboard, then confirm — that emails the customer and
                links the order to their account.`
              : `Stripe has not reported a completed payment for this order yet${
                  order.stripe_reported_status ? ` (last read: ${order.stripe_reported_status})` : ""
                }. Re-read Stripe before confirming.`}
          </p>
          {amountMismatch && (
            <p className="mt-2 font-mono text-xs text-ember">
              Amount mismatch: Stripe {money(order.stripe_amount_total_cents!)} vs order total{" "}
              {money(order.total_cents)}. Investigate before confirming.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={confirmPayment}
              disabled={Boolean(busy)}
              className="display glow-red bg-crimson px-6 py-2 text-offwhite hover:bg-ember disabled:opacity-50"
            >
              {busy === "confirm" ? "Confirming…" : "Confirm Payment as Paid"}
            </button>
            <button
              onClick={syncStripe}
              disabled={Boolean(busy)}
              className="label-caps border border-steel-light px-5 py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-50"
            >
              {busy === "sync" ? "Reading Stripe…" : "Re-read from Stripe"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 font-mono text-sm text-ember">{error}</p>}
      {saved && <p className="mt-4 font-mono text-sm text-success">{saved}</p>}

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
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
                  <dt className="label-caps text-silver">
                    Discount {order.discount_code && `(${order.discount_code})`}
                  </dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm text-ember">-{money(order.discount_cents)}</dd>
                </div>
              )}
              {order.refunded_cents ? (
                <div className="spec-row">
                  <dt className="label-caps text-silver">Refunded</dt>
                  <span className="spec-leader" />
                  <dd className="font-mono text-sm text-ember">-{money(order.refunded_cents)}</dd>
                </div>
              ) : null}
              <div className="spec-row">
                <dt className="display text-lg">Total</dt>
                <span className="spec-leader" />
                <dd className="font-mono text-lg font-bold text-ember">{money(order.total_cents)}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">Stripe</h2>
            <dl className="mt-4 space-y-2">
              {[
                ["Reported status", order.stripe_reported_status ?? "not read yet"],
                [
                  "Reported amount",
                  order.stripe_amount_total_cents != null
                    ? money(order.stripe_amount_total_cents)
                    : "—",
                ],
                ["Payment intent", order.stripe_payment_intent_id ?? "—"],
                ["Checkout session", order.stripe_session_id ?? "—"],
                [
                  "Last read",
                  order.stripe_checked_at
                    ? new Date(order.stripe_checked_at).toLocaleString("en-US")
                    : "never",
                ],
                ["Confirmed by", order.confirmed_by_email ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="spec-row">
                  <dt className="label-caps text-silver">{label}</dt>
                  <span className="spec-leader" />
                  <dd className="break-all font-mono text-xs text-chrome">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-4">
              <button onClick={syncStripe} disabled={Boolean(busy)} className="label-caps text-ember hover:text-blush disabled:opacity-50">
                Re-read from Stripe →
              </button>
              {order.stripe_receipt_url && (
                <a href={order.stripe_receipt_url} target="_blank" rel="noreferrer" className="label-caps text-ember hover:text-blush">
                  Stripe receipt →
                </a>
              )}
              {isPaid && order.stripe_payment_intent_id && (
                <button onClick={refund} disabled={Boolean(busy)} className="label-caps text-ember hover:text-blush disabled:opacity-50">
                  {busy === "refund" ? "Refunding…" : "Refund payment →"}
                </button>
              )}
            </div>
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

          <div className="border border-steel bg-carbon p-6">
            <h2 className="display text-xl">Timeline</h2>
            <p className="mt-1 font-mono text-xs text-silver">
              Every status change, email, and automated update on this order.
            </p>
            {order.events.length === 0 ? (
              <p className="mt-4 font-mono text-sm text-silver">Nothing recorded yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {order.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-steel-light pl-4">
                    <p className="text-sm text-chrome">{event.message}</p>
                    <p className="mt-1 font-mono text-xs text-silver">
                      {new Date(event.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {" · "}
                      {event.type.replace(/_/g, " ")}
                      {event.actor_email ? ` · ${event.actor_email}` : ""}
                      {event.email_to && (
                        <span className={event.notified ? "text-success" : "text-ember"}>
                          {" · "}
                          {event.notified ? `emailed ${event.email_to}` : "email failed"}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="h-fit space-y-5 border border-steel bg-carbon p-6">
          <h2 className="display text-xl">Fulfilment</h2>
          <label className="block">
            <span className="label-caps text-silver">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-tech mt-2">
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>
            <span className="mt-2 block font-mono text-xs leading-relaxed text-silver">
              {STATUS_HELP[status]}
            </span>
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
            <span className="label-caps text-silver">Note to the customer</span>
            <textarea
              rows={2}
              className="input-tech mt-2 resize-y"
              placeholder="Added to the notification email (optional)"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
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
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span className="label-caps text-silver">Email the customer about this change</span>
          </label>
          <p className="font-mono text-xs leading-relaxed text-silver">
            Every status change emails the customer by default. Untick only to correct a mistake
            without spamming them.
          </p>
          <button
            onClick={save}
            disabled={Boolean(busy)}
            className="display glow-red w-full bg-crimson py-3 text-offwhite hover:bg-ember disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save Changes"}
          </button>

          <div className="space-y-3 border-t border-steel pt-5">
            <h3 className="label-caps text-blush">Customer account</h3>
            {order.user_id ? (
              <p className="font-mono text-xs text-success">
                Linked{order.account_linked_at ? ` on ${new Date(order.account_linked_at).toLocaleDateString("en-US")}` : ""}.
              </p>
            ) : (
              <>
                <p className="font-mono text-xs leading-relaxed text-silver">
                  {order.account_invite_sent_at
                    ? `Invitation sent ${new Date(order.account_invite_sent_at).toLocaleDateString("en-US")}. The order attaches automatically when they sign up with ${order.email}.`
                    : `No account for ${order.email} yet.`}
                </p>
                <button
                  onClick={() => linkAccount(Boolean(order.account_invite_sent_at))}
                  disabled={Boolean(busy)}
                  className="label-caps w-full border border-steel-light py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-50"
                >
                  {busy === "link"
                    ? "Working…"
                    : order.account_invite_sent_at
                      ? "Re-send invite"
                      : "Link or invite"}
                </button>
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-steel pt-5">
            <h3 className="label-caps text-blush">Notifications</h3>
            <button
              onClick={resendNotification}
              disabled={Boolean(busy)}
              className="label-caps w-full border border-steel-light py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-50"
            >
              {busy === "notify" ? "Sending…" : "Re-send current status email"}
            </button>
            <p className="font-mono text-xs text-silver">
              Delivery updates sent: {order.delivery_updates_sent?.join(", ") || "none"}
            </p>
            <div className="flex gap-2">
              {[7, 12, 20].map((day) => (
                <button
                  key={day}
                  onClick={() => sendDeliveryUpdate(day)}
                  disabled={Boolean(busy) || !isPaid}
                  className="label-caps flex-1 border border-steel-light py-2 text-chrome hover:border-ember hover:text-ember disabled:opacity-40"
                >
                  Day {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
