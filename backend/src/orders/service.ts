import { randomUUID } from "node:crypto";
import { db } from "../supabase";
import { env } from "../env";
import {
  sendAbandonedCart,
  sendAccountInvite,
  sendDeliveryUpdate,
  sendOrderStatusChanged,
  sendPaymentConfirmed,
  type OrderEmailData,
  type SendResult,
} from "../email";
import { claimStage, markClaimResult, recordStage } from "./events";
import {
  ABANDONED_REMINDER_DAYS,
  abandonedStageKey,
  dueAbandonedReminder,
  dueStage,
  dueStages,
} from "../../../shared/core/stages";
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
  fulfillment_stage: string;
  courier: string | null;
  last_notified_at: string | null;
  shipping: unknown;
  order_number: string | null;
  created_at: string;
}

// One literal, deliberately: supabase-js only derives row types from a
// literal select string — concatenating it collapses the result to `unknown`.
const ORDER_COLUMNS =
  "id, user_id, email, status, payment_status, subtotal_cents, discount_cents, total_cents, discount_code, tracking_number, paid_at, account_invite_sent_at, account_linked_at, stripe_session_id, stripe_payment_intent_id, delivery_updates_sent, last_notified_at, fulfillment_stage, courier, shipping, order_number, created_at";

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
  /** Supply only for something that must happen at most once per order. */
  stage?: string;
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
      // order_events.stage is NOT NULL and UNIQUE per order — it is the
      // idempotency key for things that happen ONCE (see orders/events.ts).
      // Free-form history (notes, status changes, invites) can legitimately
      // repeat, so each gets its own unguessable key rather than competing
      // for a shared one.
      stage: input.stage ?? `event:${randomUUID()}`,
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
// The clock: fulfilment stages and abandoned-order recovery
//
// Both sweeps claim an order_events row before doing anything. The claim IS
// the idempotency check — see orders/events.ts. Two overlapping cron runs
// therefore cannot double-send, without either of them holding a lock or
// asking "did we already?" first.
// ---------------------------------------------------------------------------

export interface SweepResult {
  checked: number;
  sent: { orderId: string; stage: string; ok: boolean }[];
  skipped: number;
  ranAt: string;
}

const DAY_MS = 86_400_000;

/** Line items in the shape the stage emails want. */
async function itemsFor(orderId: string): Promise<{ name: string; qty: number; color?: string | null }[]> {
  const { data } = await db()
    .from("order_items")
    .select("product_name, qty, color")
    .eq("order_id", orderId);
  return (data ?? []).map((i) => ({ name: i.product_name, qty: i.qty, color: i.color }));
}

/**
 * Advances every in-flight order to the stage it is actually due, and emails
 * only that one. `dueStage` returns the LAST due stage, so an order paid 40
 * days ago lands correctly in a single step instead of firing four emails.
 */
export async function runDeliveryUpdates(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, sent: [], skipped: 0, ranAt: now.toISOString() };

  const oldest = new Date(now.getTime() - 120 * DAY_MS).toISOString();
  const { data, error } = await db()
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("status", ["paid", "processing", "shipped"])
    .eq("payment_status", "paid")
    .not("paid_at", "is", null)
    .gte("paid_at", oldest)
    .order("paid_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[cron] could not load orders for the stage sweep", error);
    return result;
  }

  for (const row of (data ?? []) as unknown as OrderRow[]) {
    result.checked += 1;
    const paidAt = row.paid_at ? new Date(row.paid_at) : null;
    if (!paidAt) {
      result.skipped += 1;
      continue;
    }

    const due = dueStage(paidAt, now);
    if (!due || !due.emails || due.stage === row.fulfillment_stage) {
      result.skipped += 1;
      continue;
    }

    // Record every stage we passed, so the customer timeline has no holes —
    // but only the last one is emailed.
    for (const passed of dueStages(paidAt, now)) {
      if (passed.stage === due.stage) continue;
      await recordStage({
        orderId: row.id,
        stage: passed.stage,
        type: "stage",
        title: passed.title,
        message: passed.body,
        actor: { email: "delivery-cron" },
      });
    }

    const claim = await claimStage({
      orderId: row.id,
      stage: due.stage,
      type: "stage",
      title: due.title,
      message: due.body,
      toStatus: row.status,
      actor: { email: "delivery-cron" },
      metadata: { days_since_paid: Math.floor((now.getTime() - paidAt.getTime()) / DAY_MS) },
    });

    if (!claim.claimed) {
      // Another run already holds this stage. Do nothing — do not retry.
      result.skipped += 1;
      continue;
    }

    const sendResult = await sendDeliveryUpdate(row.email, row.id, due.stage, {
      trackingNumber: row.tracking_number,
      courier: row.courier,
      countryCode: shippingCountry(row),
      items: await itemsFor(row.id),
    });

    if (claim.eventId) {
      await markClaimResult(claim.eventId, {
        emailSent: sendResult.ok,
        emailTo: row.email,
        emailSubject: due.title,
        error: sendResult.error,
      });
    }

    // A failed email must never roll back the order.
    await db()
      .from("orders")
      .update({
        fulfillment_stage: due.stage,
        stage_updated_at: now.toISOString(),
        last_notified_at: sendResult.ok ? now.toISOString() : row.last_notified_at,
      })
      .eq("id", row.id);

    result.sent.push({ orderId: row.id, stage: due.stage, ok: sendResult.ok });
  }

  await recordSweep("delivery_cron", result, now);
  console.log(
    `[cron] stages: checked ${result.checked}, sent ${result.sent.length}, skipped ${result.skipped}`,
  );
  return result;
}

/**
 * Abandoned-order recovery: chase at day 3, 7 and 12, then stop.
 *
 * Before every send we check whether this address has bought anything since.
 * If the check ERRORS we skip the send — failing safe, because emailing "you
 * left something behind" to somebody who has already paid is worse than
 * staying quiet. Never invents a discount, a deadline or a stock scare.
 */
export async function runAbandonedRecovery(now = new Date()): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, sent: [], skipped: 0, ranAt: now.toISOString() };

  const oldest = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const { data, error } = await db()
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("status", "pending_payment")
    .gte("created_at", oldest)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[cron] could not load abandoned orders", error);
    return result;
  }

  for (const row of (data ?? []) as unknown as OrderRow[]) {
    result.checked += 1;
    const createdAt = new Date(row.created_at);
    const day = dueAbandonedReminder(createdAt, now);
    if (day === null) {
      result.skipped += 1;
      continue;
    }

    // Has this address bought anything since? Fail SAFE on error.
    const { data: purchases, error: purchaseError } = await db()
      .from("orders")
      .select("id")
      .ilike("email", row.email)
      .eq("payment_status", "paid")
      .gte("created_at", row.created_at)
      .limit(1);
    if (purchaseError) {
      console.warn("[cron] purchase check failed, skipping reminder", purchaseError);
      result.skipped += 1;
      continue;
    }
    if ((purchases ?? []).length > 0) {
      // Stop permanently: claim every remaining reminder so no later run sends.
      for (const remaining of ABANDONED_REMINDER_DAYS) {
        await recordStage({
          orderId: row.id,
          stage: abandonedStageKey(remaining),
          type: "abandoned_stopped",
          message: "Stopped: this customer has bought since.",
          actor: { email: "abandoned-cron" },
        });
      }
      result.skipped += 1;
      continue;
    }

    const claim = await claimStage({
      orderId: row.id,
      stage: abandonedStageKey(day),
      type: "abandoned_reminder",
      title: `Abandoned reminder, day ${day}`,
      message: `Day ${day} abandoned-cart reminder.`,
      actor: { email: "abandoned-cron" },
    });
    if (!claim.claimed) {
      result.skipped += 1;
      continue;
    }

    const emailData = await getOrderEmailData(row);
    const sendResult = await sendAbandonedCart(row.email, emailData, {
      resumeUrl: `${env.frontendUrl}/cart?resume=${row.id}`,
      reminderNumber: ABANDONED_REMINDER_DAYS.indexOf(day as never) + 1,
    });

    if (claim.eventId) {
      await markClaimResult(claim.eventId, {
        emailSent: sendResult.ok,
        emailTo: row.email,
        emailSubject: `Abandoned reminder day ${day}`,
        error: sendResult.error,
      });
    }
    result.sent.push({ orderId: row.id, stage: abandonedStageKey(day), ok: sendResult.ok });
  }

  await recordSweep("abandoned_cron", result, now);
  console.log(
    `[cron] abandoned: checked ${result.checked}, sent ${result.sent.length}, skipped ${result.skipped}`,
  );
  return result;
}

async function recordSweep(key: string, result: SweepResult, now: Date): Promise<void> {
  await db()
    .from("system_state")
    .upsert(
      {
        key,
        value: {
          ran_at: result.ranAt,
          checked: result.checked,
          sent: result.sent.length,
          skipped: result.skipped,
        },
        updated_at: now.toISOString(),
      },
      { onConflict: "key" },
    );
}

/** Destination country, for the delivery window quoted in stage emails. */
function shippingCountry(row: OrderRow): string | null {
  const shipping = row.shipping as Record<string, unknown> | null | undefined;
  const country = shipping?.country;
  return typeof country === "string" ? country : null;
}
