import { Router } from "express";
import { db, requireDb } from "../supabase";
import { env } from "../env";
import { getUserFromRequest } from "../auth";
import { clampQty, computePricing, type PricedItem } from "../pricing";
import { lookupDiscount } from "./public";
import { createStripeCheckout, stripe, stripeEnabled } from "../payments/stripe";
import { sendAdminNewOrder, sendOrderReceived, type OrderEmailData } from "../email";
import { claimOrdersForUser, getOrder, recordEvent, syncStripeSession } from "../orders/service";
import { readOrigin, originColumns } from "../orders/origin";
import { parseColors, resolveColor, type ProductColor } from "../../../shared/core/colors";
import { deliveryWindow, estimatedDeliveryAt } from "../../../shared/core/delivery";
import { normaliseAddress, validateAddress } from "../../../shared/core/validation";

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

interface OrderLineInput {
  slug: string;
  qty: number;
  /** Chosen colour. Absent means "the default" — never a rejection. */
  color?: string | null;
}

ordersRouter.post("/orders", requireDb, async (req, res) => {
  const items = (req.body?.items ?? []) as OrderLineInput[];
  const discountCode = req.body?.discountCode ? String(req.body.discountCode).toUpperCase() : undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // ONE validation module, shared with the browser form. The browser check is
  // a courtesy; this one decides. Errors name the field so the form can
  // highlight it.
  const shipping = normaliseAddress(req.body?.shipping ?? {});
  const addressErrors = validateAddress(shipping);
  if (addressErrors.length > 0) {
    return res.status(400).json({
      error: addressErrors[0].message,
      fieldErrors: addressErrors,
    });
  }
  if (!stripe) return res.status(503).json({ error: "Card payment is not configured" });

  const user = await getUserFromRequest(req);

  // Price everything server-side; the client sends ids, quantities and
  // colours, and nothing else about money.
  const priced: PricedItem[] = [];
  for (const item of items) {
    const { data } = await db()
      .from("products")
      .select("id, name, price_cents, in_stock, status, colors, description, image")
      .eq("slug", item.slug)
      .maybeSingle();
    if (!data) return res.status(400).json({ error: `Unknown product: ${item.slug}` });
    if (data.status === "archived" || data.status === "draft") {
      return res.status(409).json({ error: `${data.name} is no longer available` });
    }
    if (!data.in_stock) return res.status(409).json({ error: `${data.name} is out of stock` });

    // Colours come from the column, falling back to the description for
    // products uploaded before that column existed.
    const colors: ProductColor[] = Array.isArray(data.colors) && data.colors.length
      ? (data.colors as ProductColor[])
      : parseColors(data.description);

    let color: string | null;
    try {
      // Applies the default when the line has none (a stale cart, a
      // non-browser request), and REFUSES a colour the product does not come
      // in — quietly substituting one would put a colour on the order the
      // buyer explicitly did not ask for.
      color = resolveColor(colors, item.color);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid colour" });
    }

    priced.push({
      productId: data.id,
      slug: item.slug,
      name: data.name,
      unitCents: data.price_cents,
      qty: clampQty(item.qty),
      color,
      imageUrl: data.image ?? null,
    });
  }

  const percentOff = discountCode ? ((await lookupDiscount(discountCode)) ?? 0) : 0;
  const pricing = computePricing(priced, percentOff);

  // What the CDN already knows plus the browser's own timezone. Advisory
  // only — never used to refuse an order, and no IP address is stored.
  const origin = readOrigin(req, req.body?.timezone);

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
      payment_provider: "stripe",
      currency: env.stripeCurrency,
      ...originColumns(origin, shipping.country),
    })
    .select("id, order_number")
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
        // Colour is part of the line identity and must reach every email and
        // the PDF, not just the cart.
        color: p.color ?? null,
        image_url: p.imageUrl ?? null,
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
      email: shipping.email,
      items: priced,
      discountCents: pricing.discountCents,
      discountCode,
      shipping: {
        firstName: shipping.firstName,
        lastName: shipping.lastName,
        address: shipping.address,
        city: shipping.city,
        zip: shipping.postalCode,
        phone: shipping.phone,
        email: shipping.email,
      },
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

    const emailData: OrderEmailData = {
      id: order.id,
      items: priced.map((p) => ({ name: p.name, qty: p.qty, unitCents: p.unitCents, color: p.color })),
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      discountCode: pricing.percentOff ? discountCode : null,
      orderNumber: order.order_number as string | null,
    };
    // NOT a confirmation — the payment has not happened yet. The receipt is
    // sent when an admin confirms it.
    void sendOrderReceived(shipping.email, emailData);
    void sendAdminNewOrder({ ...emailData, email: shipping.email });

    res.json({
      id: order.id,
      orderNumber: order.order_number,
      status: "pending_payment",
      paymentStatus: "unpaid",
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      discountCode: pricing.percentOff ? discountCode : undefined,
      deliveryWindow: deliveryWindow(shipping.country),
      estimatedDeliveryAt: estimatedDeliveryAt(new Date(), shipping.country).toISOString(),
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
