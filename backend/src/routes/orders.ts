import { Router, raw } from "express";
import { db, requireDb } from "../supabase";
import { getUserFromRequest } from "../auth";
import { clampQty, computePricing, type PricedItem } from "../pricing";
import { lookupDiscount } from "./public";
import { createStripeCheckout, stripe, verifyStripeWebhook } from "../payments/stripe";
import { capturePaypalOrder, createPaypalOrder, paypalEnabled } from "../payments/paypal";
import { sendOrderConfirmation } from "../email";

export const ordersRouter = Router();
export const webhooksRouter = Router();

/** Providers the storefront can offer at checkout. */
ordersRouter.get("/payments/config", (_req, res) => {
  res.json({ stripe: Boolean(stripe), paypal: paypalEnabled() });
});

interface OrderItemInput {
  slug: string;
  qty: number;
}

const SHIPPING_FIELDS = ["firstName", "lastName", "address", "city", "zip", "phone", "email"] as const;

ordersRouter.post("/orders", requireDb, async (req, res) => {
  const items = (req.body?.items ?? []) as OrderItemInput[];
  const shipping = req.body?.shipping ?? {};
  const provider = String(req.body?.provider ?? "");
  const discountCode = req.body?.discountCode ? String(req.body.discountCode).toUpperCase() : undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }
  for (const field of SHIPPING_FIELDS) {
    if (!String(shipping[field] ?? "").trim()) {
      return res.status(400).json({ error: `Missing shipping field: ${field}` });
    }
  }
  if (provider === "stripe" && !stripe) return res.status(503).json({ error: "Stripe is not configured" });
  if (provider === "paypal" && !paypalEnabled()) return res.status(503).json({ error: "PayPal is not configured" });
  if (provider !== "stripe" && provider !== "paypal") {
    return res.status(400).json({ error: "Choose a payment method (stripe or paypal)" });
  }

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
      email: shipping.email,
      shipping,
      subtotal_cents: pricing.subtotalCents,
      discount_cents: pricing.discountCents,
      total_cents: pricing.totalCents,
      discount_code: pricing.percentOff ? discountCode : null,
      status: "pending_payment",
      payment_status: "unpaid",
      payment_provider: provider,
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
    const redirect =
      provider === "stripe"
        ? await createStripeCheckout(order.id, shipping.email, priced, pricing.discountCents, discountCode)
        : await createPaypalOrder(order.id, pricing.totalCents);
    await db()
      .from("orders")
      .update({ payment_ref: "sessionId" in redirect ? redirect.sessionId : redirect.paypalOrderId })
      .eq("id", order.id);
    res.json({
      id: order.id,
      status: "pending_payment",
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      discountCode: pricing.percentOff ? discountCode : undefined,
      redirectUrl: redirect.redirectUrl,
    });
  } catch (err) {
    console.error("payment session failed", err);
    await db().from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
    res.status(502).json({ error: "Could not start the payment. Try again or use the other payment method." });
  }
});

/** Order status for the confirmation page (safe subset, keyed by unguessable uuid). */
ordersRouter.get("/orders/:id", requireDb, async (req, res) => {
  const { data } = await db()
    .from("orders")
    .select("id, status, payment_status, subtotal_cents, discount_cents, total_cents, discount_code, created_at")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!data) return res.status(404).json({ error: "Order not found" });
  res.json({
    id: data.id,
    status: data.status,
    paymentStatus: data.payment_status,
    subtotalCents: data.subtotal_cents,
    discountCents: data.discount_cents,
    totalCents: data.total_cents,
    discountCode: data.discount_code ?? undefined,
  });
});

async function markOrderPaid(orderId: string, paymentRef: string | null): Promise<void> {
  const { data: order } = await db()
    .from("orders")
    .select("id, email, status, subtotal_cents, discount_cents, total_cents, discount_code")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "pending_payment") return; // idempotent

  await db()
    .from("orders")
    .update({ status: "paid", payment_status: "paid", ...(paymentRef ? { payment_ref: paymentRef } : {}) })
    .eq("id", orderId);

  const { data: items } = await db()
    .from("order_items")
    .select("product_name, qty, unit_price_cents")
    .eq("order_id", orderId);
  void sendOrderConfirmation(order.email, {
    id: order.id,
    items: (items ?? []).map((i) => ({ name: i.product_name, qty: i.qty, unitCents: i.unit_price_cents })),
    subtotalCents: order.subtotal_cents,
    discountCents: order.discount_cents,
    totalCents: order.total_cents,
    discountCode: order.discount_code,
  });
}

/** PayPal capture — called by the return page after buyer approval. */
ordersRouter.post("/payments/paypal/capture", requireDb, async (req, res) => {
  const orderId = String(req.body?.orderId ?? "");
  const paypalOrderId = String(req.body?.paypalOrderId ?? "");
  if (!orderId || !paypalOrderId) return res.status(400).json({ error: "orderId and paypalOrderId required" });

  const { data: order } = await db()
    .from("orders")
    .select("id, status, payment_ref")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.payment_ref && order.payment_ref !== paypalOrderId) {
    return res.status(409).json({ error: "Payment reference mismatch" });
  }
  if (order.status !== "pending_payment") return res.json({ ok: true, status: order.status });

  try {
    const capture = await capturePaypalOrder(paypalOrderId);
    if (!capture.completed || (capture.customId && capture.customId !== orderId)) {
      return res.status(402).json({ error: "Payment was not completed" });
    }
    await markOrderPaid(orderId, capture.captureId ?? paypalOrderId);
    res.json({ ok: true, status: "paid" });
  } catch (err) {
    console.error("paypal capture failed", err);
    res.status(502).json({ error: "PayPal capture failed" });
  }
});

/**
 * Stripe webhook. Mounted with a raw body parser (signature verification
 * needs the exact bytes) — see index.ts.
 */
webhooksRouter.post("/stripe", raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") return res.status(400).json({ error: "Missing signature" });

  let event;
  try {
    event = verifyStripeWebhook(req.body as Buffer, signature);
  } catch (err) {
    console.error("stripe webhook verification failed", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { id: string; metadata?: { order_id?: string } };
    const orderId = session.metadata?.order_id;
    if (orderId) await markOrderPaid(orderId, session.id);
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as { metadata?: { order_id?: string } };
    const orderId = session.metadata?.order_id;
    if (orderId) {
      await db()
        .from("orders")
        .update({ status: "cancelled", payment_status: "failed" })
        .eq("id", orderId)
        .eq("status", "pending_payment");
    }
  }

  res.json({ received: true });
});
