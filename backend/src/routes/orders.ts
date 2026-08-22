import { Router } from "express";
import { db, requireDb } from "../supabase";
import { env } from "../env";
import { getUserFromRequest } from "../auth";
import { clampQty, computePricing, type PricedItem } from "../pricing";
import { lookupDiscount } from "./public";
import { createStripeCheckout, stripe, stripeEnabled } from "../payments/stripe";
import { sendAdminNewOrder, sendOrderReceived, type OrderEmailData } from "../email";
import { claimOrdersForUser, getOrder, recordEvent, syncStripeSession } from "../orders/service";

export const ordersRouter = Router();

/**
 * Checkout is Stripe-only and webhook-free. Creating an order hands the buyer
 * a hosted Checkout Session; when they come back, POST /orders/:id/sync pulls
 * the real payment state from Stripe. Nothing here marks an order paid — an
 * admin confirms every payment in /admin/orders.
 */

ordersRouter.get("/payments/config", (_req, res) => {
  res.json({
    stripe: stripeEnabled(),
    publishableKey: env.stripePublishableKey ?? null,
    currency: env.stripeCurrency,
    // The storefront uses this to explain the manual-confirmation step.
    manualApproval: true,
    deliveryDays: { min: env.deliveryMinDays, max: env.deliveryMaxDays },
  });
});

interface OrderItemInput {
  slug: string;
  qty: number;
}

const SHIPPING_FIELDS = ["firstName", "lastName", "address", "city", "zip", "phone", "email"] as const;

ordersRouter.post("/orders", requireDb, async (req, res) => {
  const items = (req.body?.items ?? []) as OrderItemInput[];
  const shipping = req.body?.shipping ?? {};
  const discountCode = req.body?.discountCode ? String(req.body.discountCode).toUpperCase() : undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }
  for (const field of SHIPPING_FIELDS) {
    if (!String(shipping[field] ?? "").trim()) {
      return res.status(400).json({ error: `Missing shipping field: ${field}` });
    }
  }
  const email = String(shipping.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "A valid email address is required" });
  }
  if (!stripe) return res.status(503).json({ error: "Card payment is not configured" });

  const user = await getUserFromRequest(req);

  // Price everything server-side; never trust client totals.
  const priced: PricedItem[] = [];
  for (const item of items) {
    const { data } = await db()
      .from("products")
      .select("id, name, price_cents, in_stock")
      .eq("slug", item.slug)
      .maybeSingle();
    if (!data) return res.status(400).json({ error: `Unknown product: ${item.slug}` });
    if (!data.in_stock) return res.status(409).json({ error: `${data.name} is out of stock` });
    priced.push({
      productId: data.id,
      slug: item.slug,
      name: data.name,
      unitCents: data.price_cents,
      qty: clampQty(item.qty),
    });
  }

  const percentOff = discountCode ? ((await lookupDiscount(discountCode)) ?? 0) : 0;
  const pricing = computePricing(priced, percentOff);

  const { data: order, error: orderError } = await db()
    .from("orders")
    .insert({
      user_id: user?.id ?? null,
      email,
      shipping: { ...shipping, email },
      subtotal_cents: pricing.subtotalCents,
      discount_cents: pricing.discountCents,
      total_cents: pricing.totalCents,
      discount_code: pricing.percentOff ? discountCode : null,
      status: "pending_payment",
      payment_status: "unpaid",
      payment_provider: "stripe",
      currency: env.stripeCurrency,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    console.error("order insert failed", orderError);
    return res.status(500).json({ error: "Could not place order" });
  }

  const { error: itemsError } = await db()
    .from("order_items")
    .insert(
      priced.map((p) => ({
        order_id: order.id,
        product_id: p.productId,
        product_slug: p.slug,
        product_name: p.name,
        unit_price_cents: p.unitCents,
        qty: p.qty,
      })),
    );
  if (itemsError) {
    console.error("order items insert failed", itemsError);
    await db().from("orders").delete().eq("id", order.id);
    return res.status(500).json({ error: "Could not place order" });
  }

  try {
    const checkout = await createStripeCheckout({
      orderId: order.id,
      email,
      items: priced,
      discountCents: pricing.discountCents,
      discountCode,
      shipping: { ...shipping, email },
    });
    await db()
      .from("orders")
      .update({ payment_ref: checkout.sessionId, stripe_session_id: checkout.sessionId })
      .eq("id", order.id);

    await recordEvent({
      orderId: order.id,
      type: "note",
      toStatus: "pending_payment",
      message: "Order created and Stripe Checkout session opened.",
      metadata: { stripe_session_id: checkout.sessionId },
    });

    // Receipt-of-order email now; the payment-confirmed email comes later,
    // from an admin approving it.
    const emailData: OrderEmailData = {
      id: order.id,
      items: priced.map((p) => ({ name: p.name, qty: p.qty, unitCents: p.unitCents })),
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      discountCode: pricing.percentOff ? discountCode : null,
    };
    void sendOrderReceived(email, emailData);
    void sendAdminNewOrder({ ...emailData, email });

    res.json({
      id: order.id,
      status: "pending_payment",
      paymentStatus: "unpaid",
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      discountCode: pricing.percentOff ? discountCode : undefined,
      redirectUrl: checkout.redirectUrl,
    });
  } catch (err) {
    console.error("payment session failed", err);
    await db().from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
    res.status(502).json({ error: "Could not start the payment. Try again in a moment." });
  }
});

/** Order status for the confirmation page (safe subset, keyed by unguessable uuid). */
ordersRouter.get("/orders/:id", requireDb, async (req, res) => {
  const { data } = await db()
    .from("orders")
    .select(
      // One literal so supabase-js types the row (see orders/service.ts).
      "id, status, payment_status, subtotal_cents, discount_cents, total_cents, discount_code, tracking_number, paid_at, shipped_at, delivered_at, created_at, user_id, email",
    )
    .eq("id", req.params.id)
    .maybeSingle();
  if (!data) return res.status(404).json({ error: "Order not found" });

  const { data: items } = await db()
    .from("order_items")
    .select("product_name, product_slug, qty, unit_price_cents")
    .eq("order_id", data.id);

  const { data: events } = await db()
    .from("order_events")
    .select("type, to_status, message, created_at")
    .eq("order_id", data.id)
    .in("type", ["status_change", "payment_confirmed", "delivery_update", "account_linked"])
    .order("created_at", { ascending: false })
    .limit(25);

  res.json({
    id: data.id,
    status: data.status,
    paymentStatus: data.payment_status,
    subtotalCents: data.subtotal_cents,
    discountCents: data.discount_cents,
    totalCents: data.total_cents,
    discountCode: data.discount_code ?? undefined,
    trackingNumber: data.tracking_number ?? undefined,
    paidAt: data.paid_at ?? undefined,
    shippedAt: data.shipped_at ?? undefined,
    deliveredAt: data.delivered_at ?? undefined,
    createdAt: data.created_at,
    hasAccount: Boolean(data.user_id),
    emailHint: maskEmail(String(data.email ?? "")),
    items: (items ?? []).map((i) => ({
      name: i.product_name,
      slug: i.product_slug,
      qty: i.qty,
      unitCents: i.unit_price_cents,
    })),
    timeline: (events ?? []).map((e) => ({
      type: e.type,
      status: e.to_status,
      message: e.message,
      at: e.created_at,
    })),
  });
});

/** j***@example.com — enough for the buyer to recognise, useless to a scraper. */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "";
  return `${name.slice(0, 1)}${"*".repeat(Math.max(1, name.length - 1))}@${domain}`;
}

/**
 * Pulls the live Stripe Checkout Session for this order and records what
 * Stripe reports. Called by the success page instead of a webhook. It moves
 * the order to `awaiting_confirmation` at most — never to paid.
 */
ordersRouter.post("/orders/:id/sync", requireDb, async (req, res) => {
  const sessionId = req.body?.sessionId ? String(req.body.sessionId) : undefined;
  const result = await syncStripeSession(req.params.id, sessionId);
  if (!result.ok) return res.status(400).json({ error: result.error ?? "Could not verify payment" });

  const order = await getOrder(req.params.id);
  res.json({
    ok: true,
    status: order?.status ?? "pending_payment",
    paymentStatus: order?.payment_status ?? "unpaid",
    stripeStatus: result.stripeStatus,
    awaitingConfirmation: order?.status === "awaiting_confirmation",
  });
});

/**
 * Attaches every guest order placed with the signed-in user's address to their
 * account. Called by the frontend right after sign-in/sign-up.
 */
ordersRouter.post("/orders/claim", requireDb, async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user?.email) return res.status(401).json({ error: "Authentication required" });
  const claimed = await claimOrdersForUser(user.id, user.email);
  res.json({ ok: true, claimed });
});
