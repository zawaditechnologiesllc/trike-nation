import { db } from "../supabase";
import { env } from "../env";
import {
  sendAccountInvite,
  sendDeliveryUpdate,
  sendOrderStatusChanged,
  sendPaymentConfirmed,
  type OrderEmailData,
  type SendResult,
} from "../email";
import { retrieveCheckoutSession } from "../payments/stripe";

/**
 * The single place order state changes. Everything that moves an order —
 * an admin confirming payment, a fulfilment update, the delivery cron —
 * goes through setOrderStatus so that three things always happen together:
 *
 *   1. the row is updated with the right timestamps,
 *   2. an order_events row records who did it and what was emailed,
 *   3. the customer is notified.
 */

export const ORDER_STATUSES = [
  "pending_payment",
  "awaiting_confirmation",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Statuses that count as money in the bank. */
export const PAID_STATUSES: OrderStatus[] = ["paid", "processing", "shipped", "delivered"];

export interface OrderRow {
  id: string;
  user_id: string | null;
  email: string;
  status: string;
  payment_status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  discount_code: string | null;
  tracking_number: string | null;
  paid_at: string | null;
  account_invite_sent_at: string | null;
  account_linked_at: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  delivery_updates_sent: number[] | null;
  created_at: string;
}

// One literal, deliberately: supabase-js only derives row types from a
// literal select string — concatenating it collapses the result to `unknown`.
const ORDER_COLUMNS =
  "id, user_id, email, status, payment_status, subtotal_cents, discount_cents, total_cents, discount_code, tracking_number, paid_at, account_invite_sent_at, account_linked_at, stripe_session_id, stripe_payment_intent_id, delivery_updates_sent, created_at";

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const { data } = await db().from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function getOrderEmailData(order: OrderRow): Promise<OrderEmailData> {
  const { data: items } = await db()
    .from("order_items")
    .select("product_name, qty, unit_price_cents")
    .eq("order_id", order.id);
  return {
    id: order.id,
    items: (items ?? []).map((i) => ({ name: i.product_name, qty: i.qty, unitCents: i.unit_price_cents })),
    subtotalCents: order.subtotal_cents,
    discountCents: order.discount_cents,
    totalCents: order.total_cents,
    discountCode: order.discount_code,
  };
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export interface EventInput {
  orderId: string;
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string;
  actor?: { id?: string | null; email?: string | null } | null;
  email?: { to: string; subject: string; result: SendResult } | null;
  metadata?: Record<string, unknown>;
}

export async function recordEvent(input: EventInput): Promise<void> {
  const { error } = await db()
    .from("order_events")
    .insert({
      order_id: input.orderId,
      type: input.type,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      message: input.message ?? "",
      notified: input.email?.result.ok ?? false,
      email_to: input.email?.to ?? null,
      email_subject: input.email?.subject ?? null,
      actor_id: input.actor?.id ?? null,
      actor_email: input.actor?.email ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.email && !input.email.result.ok && input.email.result.error
          ? { email_error: input.email.result.error }
          : {}),
        ...(input.email?.result.id ? { email_id: input.email.result.id } : {}),
      },
    });
  if (error) console.error("[orders] could not record event", error);
}

// ---------------------------------------------------------------------------
// Guest orders → accounts
// ---------------------------------------------------------------------------

export function signupUrlFor(email: string, orderId: string): string {
  const params = new URLSearchParams({ email, order: orderId, ref: "order" });
  return `${env.frontendUrl}/signup?${params.toString()}`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await db()
    .from("profiles")
    .select("id")
    .ilike("email", email.trim())
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Attaches a paid order to the buyer's account. If no account exists yet the
 * buyer is emailed an invitation to create one with the same address — the
 * profile trigger (migration 003) then links the order the moment they sign up.
 */
export async function linkOrderToAccount(order: OrderRow): Promise<{ linked: boolean; invited: boolean }> {
  if (order.user_id) return { linked: true, invited: false };

  const userId = await findUserIdByEmail(order.email);
  if (userId) {
    await db()
      .from("orders")
      .update({ user_id: userId, account_linked_at: new Date().toISOString() })
      .eq("id", order.id);
    await recordEvent({
      orderId: order.id,
      type: "account_linked",
      message: `Linked to the existing account for ${order.email}.`,
      metadata: { user_id: userId },
    });
    return { linked: true, invited: false };
  }

  if (order.account_invite_sent_at) return { linked: false, invited: false };

  const url = signupUrlFor(order.email, order.id);
  const result = await sendAccountInvite(order.email, url, order.id);
  await db()
    .from("orders")
    .update({ account_invite_sent_at: new Date().toISOString() })
    .eq("id", order.id);
  await recordEvent({
    orderId: order.id,
    type: "account_invite",
    message: `Invited ${order.email} to create an account and claim this order.`,
    email: { to: order.email, subject: "Create your account", result },
  });
  return { linked: false, invited: true };
}

/**
 * Claims every guest order placed with an address, for the account that owns
 * it. Called when a user signs in/up, complementing the DB trigger so orders
 * placed *after* signup (as a guest, same address) also attach.
 */
export async function claimOrdersForUser(userId: string, email: string): Promise<number> {
  const { data, error } = await db()
    .from("orders")
    .update({ user_id: userId, account_linked_at: new Date().toISOString() })
    .is("user_id", null)
    .ilike("email", email.trim())
    .select("id");
  if (error) {
    console.error("[orders] claim failed", error);
    return 0;
  }
  for (const row of data ?? []) {
    await recordEvent({
      orderId: row.id as string,
      type: "account_linked",
      message: `Claimed by the account for ${email}.`,
      metadata: { user_id: userId },
    });
  }
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  paid: "paid_at",
  processing: "processing_at",
  shipped: "shipped_at",
  delivered: "delivered_at",
  cancelled: "cancelled_at",
  refunded: "refunded_at",
};

const STATUS_PAYMENT_STATE: Partial<Record<OrderStatus, string>> = {
  pending_payment: "unpaid",
  awaiting_confirmation: "pending_review",
  paid: "paid",
  refunded: "refunded",
};

export interface StatusChangeOptions {
  trackingNumber?: string | null;
  note?: string | null;
  actor?: { id?: string | null; email?: string | null } | null;
  /** Skip the customer email (rarely used — e.g. correcting a typo'd status). */
  notify?: boolean;
  extraPatch?: Record<string, unknown>;
}

export interface StatusChangeResult {
  ok: boolean;
  status: OrderStatus;
  changed: boolean;
  notified: boolean;
  accountLinked?: boolean;
  accountInvited?: boolean;
  error?: string;
}

/**
 * Moves an order to `status`, writes the timeline entry, and emails the
 * customer. Every status change notifies the customer unless notify=false.
 */
export async function setOrderStatus(
  orderId: string,
  status: OrderStatus,
  opts: StatusChangeOptions = {},
): Promise<StatusChangeResult> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, status, changed: false, notified: false, error: "Order not found" };

  const notify = opts.notify !== false;
  const changed = order.status !== status;
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status, ...(opts.extraPatch ?? {}) };
  const paymentState = STATUS_PAYMENT_STATE[status];
  if (paymentState) patch.payment_status = paymentState;
  const stamp = STATUS_TIMESTAMP[status];
  // Timestamps are first-write-wins so re-saving a status doesn't rewrite history.
  if (stamp && changed) patch[stamp] = now;
  if (status === "paid" && !order.paid_at) patch.paid_at = now;
  if (opts.trackingNumber !== undefined) patch.tracking_number = opts.trackingNumber || null;
  if (opts.actor?.id && status === "paid") {
    patch.confirmed_by = opts.actor.id;
    patch.confirmed_by_email = opts.actor.email ?? null;
  }

  const { error } = await db().from("orders").update(patch).eq("id", orderId);
  if (error) {
    console.error("[orders] status update failed", error);
    return { ok: false, status, changed: false, notified: false, error: "Could not update order" };
  }

  const trackingNumber = opts.trackingNumber !== undefined ? opts.trackingNumber : order.tracking_number;
  let accountLinked: boolean | undefined;
  let accountInvited: boolean | undefined;
  let emailResult: SendResult = { ok: false, error: "notification skipped" };
  let emailSubject = "";

  if (status === "paid") {
    // Confirming payment is also what attaches the order to an account.
    const link = await linkOrderToAccount({ ...order, status });
    accountLinked = link.linked;
    accountInvited = link.invited;

    if (notify) {
      const data = await getOrderEmailData(order);
      emailSubject = `Payment confirmed — #${orderId.slice(0, 8).toUpperCase()}`;
      emailResult = await sendPaymentConfirmed(order.email, data, {
        accountSignupUrl: link.linked ? undefined : signupUrlFor(order.email, order.id),
      });
    }
  } else if (notify) {
    emailSubject = `Order update — #${orderId.slice(0, 8).toUpperCase()}`;
    emailResult = await sendOrderStatusChanged(order.email, orderId, status, {
      trackingNumber,
      note: opts.note ?? null,
    });
  }

  if (notify) {
    await db().from("orders").update({ last_notified_at: now }).eq("id", orderId);
  }

  await recordEvent({
    orderId,
    type: status === "paid" ? "payment_confirmed" : "status_change",
    fromStatus: order.status,
    toStatus: status,
    message:
      opts.note?.trim() ||
      (changed
        ? `Status changed from ${order.status.replace(/_/g, " ")} to ${status.replace(/_/g, " ")}.`
        : `Status re-saved as ${status.replace(/_/g, " ")}.`),
    actor: opts.actor ?? null,
    email: notify ? { to: order.email, subject: emailSubject, result: emailResult } : null,
    metadata: { tracking_number: trackingNumber ?? null },
  });

  return {
    ok: true,
    status,
    changed,
    notified: notify && emailResult.ok,
    accountLinked,
    accountInvited,
  };
}

// ---------------------------------------------------------------------------
// Stripe session sync (pull, not webhook)
// ---------------------------------------------------------------------------

export interface SyncResult {
  ok: boolean;
  stripeStatus?: string;
  sessionStatus?: string;
  amountMatches?: boolean;
  error?: string;
}

/**
 * Pulls the live Checkout Session from Stripe and stores what it reports on
 * the order for an admin to review. It deliberately never marks an order paid:
 * the buyer is moved to `awaiting_confirmation` and a human decides.
 */
export async function syncStripeSession(orderId: string, sessionId?: string | null): Promise<SyncResult> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };

  const id = sessionId?.trim() || order.stripe_session_id;
  if (!id) return { ok: false, error: "No Stripe session on this order" };

  let snapshot;
  try {
    snapshot = await retrieveCheckoutSession(id);
  } catch (err) {
    console.error("[orders] stripe session sync failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Stripe lookup failed" };
  }

  // A session id from the URL must belong to this order.
  if (snapshot.orderId && snapshot.orderId !== orderId) {
    return { ok: false, error: "Stripe session does not belong to this order" };
  }

  const amountMatches =
    snapshot.amountTotalCents == null || snapshot.amountTotalCents === order.total_cents;

  await db()
    .from("orders")
    .update({
      stripe_session_id: snapshot.sessionId,
      stripe_payment_intent_id: snapshot.paymentIntentId,
      stripe_charge_id: snapshot.chargeId,
      stripe_reported_status: snapshot.paymentStatus,
      stripe_amount_total_cents: snapshot.amountTotalCents,
      stripe_receipt_url: snapshot.receiptUrl,
      stripe_checked_at: new Date().toISOString(),
      ...(snapshot.paymentIntentId ? { payment_ref: snapshot.paymentIntentId } : {}),
    })
    .eq("id", orderId);

  // Stripe says the money moved → queue it for a human, don't self-approve.
  const alreadySettled = PAID_STATUSES.includes(order.status as OrderStatus) || order.status === "refunded";
  if (snapshot.paymentStatus === "paid" && order.status === "pending_payment") {
    await setOrderStatus(orderId, "awaiting_confirmation", {
      note: amountMatches
        ? "Stripe reports the payment succeeded. Awaiting manual confirmation."
        : `Stripe reports a payment of ${snapshot.amountTotalCents} cents against an order total of ${order.total_cents} cents. Awaiting manual review.`,
      actor: { email: "stripe-sync" },
    });
  } else if (snapshot.sessionStatus === "expired" && order.status === "pending_payment") {
    await recordEvent({
      orderId,
      type: "note",
      message: "Stripe checkout session expired without payment.",
      actor: { email: "stripe-sync" },
    });
  } else if (!alreadySettled) {
    await recordEvent({
      orderId,
      type: "note",
      message: `Stripe reports payment_status=${snapshot.paymentStatus}, session=${snapshot.sessionStatus}.`,
      actor: { email: "stripe-sync" },
    });
  }

  return {
    ok: true,
    stripeStatus: snapshot.paymentStatus,
    sessionStatus: snapshot.sessionStatus,
    amountMatches,
  };
}

// ---------------------------------------------------------------------------
// Delivery progress cron (day 7 / 12 / 20 after confirmed payment)
// ---------------------------------------------------------------------------

export interface DeliverySweepResult {
  checked: number;
  sent: { orderId: string; day: number; ok: boolean }[];
  skipped: number;
  ranAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runDeliveryUpdates(now = new Date()): Promise<DeliverySweepResult> {
  const milestones = [...env.deliveryUpdateDays].sort((a, b) => a - b);
  const oldest = new Date(now.getTime() - (Math.max(...milestones) + 45) * DAY_MS).toISOString();

  // Only orders in flight: confirmed but not yet delivered, cancelled or refunded.
  const { data, error } = await db()
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("status", ["paid", "processing", "shipped"])
    .eq("payment_status", "paid")
    .not("paid_at", "is", null)
    .gte("paid_at", oldest)
    .order("paid_at", { ascending: true })
    .limit(500);

  const result: DeliverySweepResult = { checked: 0, sent: [], skipped: 0, ranAt: now.toISOString() };
  if (error) {
    console.error("[cron] could not load orders for delivery updates", error);
    return result;
  }

  for (const row of (data ?? []) as unknown as OrderRow[]) {
    result.checked += 1;
    const paidAt = row.paid_at ? new Date(row.paid_at).getTime() : null;
    if (!paidAt) {
      result.skipped += 1;
      continue;
    }
    const elapsedDays = Math.floor((now.getTime() - paidAt) / DAY_MS);
    const already = new Set(row.delivery_updates_sent ?? []);
    // Only the newest milestone reached — never a burst of backdated emails.
    const due = milestones.filter((day) => elapsedDays >= day && !already.has(day));
    if (due.length === 0) {
      result.skipped += 1;
      continue;
    }
    const day = due[due.length - 1];

    const sendResult = await sendDeliveryUpdate(row.email, row.id, day, {
      trackingNumber: row.tracking_number,
      status: row.status,
    });

    // Mark every passed milestone so a late run doesn't replay the older ones.
    const merged = [...new Set([...already, ...due])].sort((a, b) => a - b);
    await db()
      .from("orders")
      .update({
        delivery_updates_sent: merged,
        last_delivery_update_at: now.toISOString(),
        last_notified_at: now.toISOString(),
      })
      .eq("id", row.id);

    await recordEvent({
      orderId: row.id,
      type: "delivery_update",
      toStatus: row.status,
      message: `Day ${day} delivery update sent (${elapsedDays} days since payment).`,
      actor: { email: "delivery-cron" },
      email: { to: row.email, subject: `Day ${day} update`, result: sendResult },
      metadata: { day, elapsed_days: elapsedDays, milestones_marked: merged },
    });

    result.sent.push({ orderId: row.id, day, ok: sendResult.ok });
  }

  await db()
    .from("system_state")
    .upsert(
      {
        key: "delivery_cron",
        value: {
          ran_at: result.ranAt,
          checked: result.checked,
          sent: result.sent.length,
          skipped: result.skipped,
          milestones,
        },
        updated_at: result.ranAt,
      },
      { onConflict: "key" },
    );

  console.log(
    `[cron] delivery updates: checked ${result.checked}, sent ${result.sent.length}, skipped ${result.skipped}`,
  );
  return result;
}
