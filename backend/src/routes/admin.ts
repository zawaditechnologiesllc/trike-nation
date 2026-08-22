import { Router } from "express";
import { db, requireDb, toProduct, type ProductRow } from "../supabase";
import { env, integrationStatus } from "../env";
import { requireAdmin } from "../auth";
import { resendHealth, sendOrderStatusChanged, sendDeliveryUpdate } from "../email";
import { refundPayment, stripeAccountSnapshot, stripeEnabled, stripeLiveMode } from "../payments/stripe";
import {
  ORDER_STATUSES,
  PAID_STATUSES,
  isOrderStatus,
  getOrder,
  linkOrderToAccount,
  recordEvent,
  runDeliveryUpdates,
  setOrderStatus,
  syncStripeSession,
} from "../orders/service";

export const adminRouter = Router();
adminRouter.use(requireDb, requireAdmin);

adminRouter.get("/me", (req, res) => {
  res.json({ isAdmin: true, id: req.user!.id, email: req.user!.email });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

adminRouter.get("/stats", async (_req, res) => {
  const [orders, products, subscribers, messages] = await Promise.all([
    db().from("orders").select("id, status, payment_status, total_cents, created_at, email, user_id"),
    db().from("products").select("id, in_stock"),
    db().from("newsletter_subscribers").select("email"),
    db().from("contact_messages").select("id, read"),
  ]);
  const all = orders.data ?? [];
  const paid = all.filter((o) => o.payment_status === "paid");
  res.json({
    revenueCents: paid.reduce((sum, o) => sum + o.total_cents, 0),
    ordersTotal: all.length,
    ordersPaid: paid.length,
    // The queue that actually needs a human: payment taken, not yet confirmed.
    ordersAwaitingConfirmation: all.filter((o) => o.status === "awaiting_confirmation").length,
    ordersAwaitingFulfilment: all.filter((o) => ["paid", "processing"].includes(o.status)).length,
    ordersInTransit: all.filter((o) => o.status === "shipped").length,
    guestOrders: paid.filter((o) => !o.user_id).length,
    products: products.data?.length ?? 0,
    productsOutOfStock: (products.data ?? []).filter((p) => !p.in_stock).length,
    subscribers: subscribers.data?.length ?? 0,
    unreadMessages: (messages.data ?? []).filter((m) => !m.read).length,
    recentOrders: all
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 8)
      .map((o) => ({
        id: o.id,
        email: o.email,
        status: o.status,
        paymentStatus: o.payment_status,
        totalCents: o.total_cents,
        createdAt: o.created_at,
      })),
  });
});

// ---------------------------------------------------------------------------
// Orders — every payment is confirmed here by hand (no Stripe webhooks)
// ---------------------------------------------------------------------------

// Kept as one literal so supabase-js can type the rows (see orders/service.ts).
const ORDER_LIST_FIELDS =
  "id, email, status, payment_status, payment_provider, total_cents, discount_code, tracking_number, created_at, paid_at, shipped_at, delivered_at, user_id, stripe_reported_status, stripe_amount_total_cents, account_invite_sent_at";

adminRouter.get("/orders", async (req, res) => {
  const status = req.query.status as string | undefined;
  const search = String(req.query.q ?? "").trim();
  let query = db()
    .from("orders")
    .select(ORDER_LIST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "needs_action") {
    query = query.in("status", ["awaiting_confirmation", "pending_payment"]);
  } else if (status && isOrderStatus(status)) {
    query = query.eq("status", status);
  }
  if (search) query = query.ilike("email", `%${search}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load orders" });
  res.json(data ?? []);
});

/**
 * Paid orders only — the money view. Returns the rows plus revenue totals so
 * the admin panel does not have to re-add them client side.
 */
adminRouter.get("/orders/paid", async (req, res) => {
  const since = String(req.query.since ?? "").trim();
  let query = db()
    .from("orders")
    .select(ORDER_LIST_FIELDS)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (since) query = query.gte("paid_at", since);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load paid orders" });

  const rows = data ?? [];
  const now = Date.now();
  const within = (days: number) =>
    rows.filter((o) => {
      const at = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
      return at != null && now - at <= days * 24 * 60 * 60 * 1000;
    });
  const sum = (list: typeof rows) => list.reduce((total, o) => total + (o.total_cents as number), 0);

  res.json({
    orders: rows,
    totals: {
      count: rows.length,
      revenueCents: sum(rows),
      last7DaysCents: sum(within(7)),
      last30DaysCents: sum(within(30)),
      awaitingFulfilment: rows.filter((o) => ["paid", "processing"].includes(o.status as string)).length,
      inTransit: rows.filter((o) => o.status === "shipped").length,
      delivered: rows.filter((o) => o.status === "delivered").length,
      unlinkedAccounts: rows.filter((o) => !o.user_id).length,
    },
  });
});

adminRouter.get("/orders/:id", async (req, res) => {
  const { data: order } = await db().from("orders").select("*").eq("id", req.params.id).maybeSingle();
  if (!order) return res.status(404).json({ error: "Order not found" });
  const [{ data: items }, { data: events }] = await Promise.all([
    db()
      .from("order_items")
      .select("product_slug, product_name, unit_price_cents, qty")
      .eq("order_id", order.id),
    db()
      .from("order_events")
      .select("*")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  res.json({ ...order, items: items ?? [], events: events ?? [] });
});

/**
 * Status changes. Every change emails the customer (set notify=false to skip),
 * and moving an order to `paid` also links it to the buyer's account or
 * invites them to create one.
 */
adminRouter.patch("/orders/:id", async (req, res) => {
  const status = req.body?.status as string | undefined;
  const trackingNumber = req.body?.trackingNumber as string | undefined;
  const adminNotes = req.body?.adminNotes as string | undefined;
  const customerNote = req.body?.customerNote as string | undefined;
  const notify = req.body?.notify !== false;

  if (status !== undefined && !isOrderStatus(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const existing = await getOrder(req.params.id);
  if (!existing) return res.status(404).json({ error: "Order not found" });

  // Internal notes are admin-only and never emailed.
  if (adminNotes !== undefined) {
    const { error } = await db()
      .from("orders")
      .update({ admin_notes: adminNotes || null })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ error: "Could not save notes" });
  }

  if (status === undefined) {
    if (trackingNumber !== undefined) {
      const { error } = await db()
        .from("orders")
        .update({ tracking_number: trackingNumber || null })
        .eq("id", req.params.id);
      if (error) return res.status(500).json({ error: "Could not save tracking number" });
    }
    return res.json({ ok: true, status: existing.status, notified: false });
  }

  const result = await setOrderStatus(req.params.id, status, {
    trackingNumber,
    note: customerNote ?? null,
    notify,
    actor: { id: req.user!.id, email: req.user!.email },
  });
  if (!result.ok) return res.status(500).json({ error: result.error ?? "Could not update order" });
  res.json(result);
});

/** One-click "the money landed" — the manual replacement for a Stripe webhook. */
adminRouter.post("/orders/:id/confirm-payment", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.payment_status === "paid") {
    return res.json({ ok: true, status: order.status, alreadyPaid: true, notified: false });
  }
  const result = await setOrderStatus(req.params.id, "paid", {
    note: req.body?.customerNote ? String(req.body.customerNote) : null,
    notify: req.body?.notify !== false,
    actor: { id: req.user!.id, email: req.user!.email },
  });
  if (!result.ok) return res.status(500).json({ error: result.error ?? "Could not confirm payment" });
  res.json(result);
});

/** Re-reads the Stripe Checkout Session so an admin can see what Stripe says. */
adminRouter.post("/orders/:id/sync-stripe", async (req, res) => {
  if (!stripeEnabled()) return res.status(503).json({ error: "Stripe is not configured" });
  const result = await syncStripeSession(req.params.id, req.body?.sessionId);
  if (!result.ok) return res.status(400).json({ error: result.error ?? "Stripe lookup failed" });
  res.json(result);
});

/** Refund through Stripe, then move the order to refunded (which emails the buyer). */
adminRouter.post("/orders/:id/refund", async (req, res) => {
  if (!stripeEnabled()) return res.status(503).json({ error: "Stripe is not configured" });
  const { data: order } = await db()
    .from("orders")
    .select("id, total_cents, stripe_payment_intent_id, payment_status")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.stripe_payment_intent_id) {
    return res.status(400).json({ error: "No Stripe payment intent on this order — sync it first" });
  }
  const amountCents = Number.isFinite(Number(req.body?.amountCents))
    ? Math.max(1, Math.min(order.total_cents, Math.round(Number(req.body.amountCents))))
    : undefined;

  try {
    const refund = await refundPayment(order.stripe_payment_intent_id, amountCents);
    await db()
      .from("orders")
      .update({ refunded_cents: refund.amountCents })
      .eq("id", order.id);
    const result = await setOrderStatus(order.id, "refunded", {
      note: req.body?.customerNote ? String(req.body.customerNote) : null,
      actor: { id: req.user!.id, email: req.user!.email },
    });
    res.json({ ...result, ok: true, refund });
  } catch (err) {
    console.error("refund failed", err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Refund failed" });
  }
});

/** Manually re-send the notification for the order's current status. */
adminRouter.post("/orders/:id/notify", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const note = req.body?.customerNote ? String(req.body.customerNote) : null;
  const result = await sendOrderStatusChanged(order.email, order.id, order.status, {
    trackingNumber: order.tracking_number,
    note,
  });
  await recordEvent({
    orderId: order.id,
    type: "status_change",
    toStatus: order.status,
    message: note || `Notification re-sent for status ${order.status.replace(/_/g, " ")}.`,
    actor: { id: req.user!.id, email: req.user!.email },
    email: { to: order.email, subject: `Order update`, result },
  });
  res.json({ ok: result.ok, error: result.error });
});

/** Send the next delivery-progress email for one order, on demand. */
adminRouter.post("/orders/:id/delivery-update", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const day = Math.round(Number(req.body?.day)) || env.deliveryUpdateDays[0];
  const result = await sendDeliveryUpdate(order.email, order.id, day, {
    trackingNumber: order.tracking_number,
    status: order.status,
  });
  const merged = [...new Set([...(order.delivery_updates_sent ?? []), day])].sort((a, b) => a - b);
  await db()
    .from("orders")
    .update({ delivery_updates_sent: merged, last_delivery_update_at: new Date().toISOString() })
    .eq("id", order.id);
  await recordEvent({
    orderId: order.id,
    type: "delivery_update",
    message: `Day ${day} delivery update sent manually.`,
    actor: { id: req.user!.id, email: req.user!.email },
    email: { to: order.email, subject: `Day ${day} update`, result },
  });
  res.json({ ok: result.ok, day, error: result.error });
});

/** Attach a guest order to an account (or re-send the invitation). */
adminRouter.post("/orders/:id/link-account", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.body?.resendInvite) {
    await db().from("orders").update({ account_invite_sent_at: null }).eq("id", order.id);
    order.account_invite_sent_at = null;
  }
  const result = await linkOrderToAccount(order);
  res.json({ ok: true, ...result });
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'“”‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function productPatchFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.slug === "string" && body.slug.trim()) patch.slug = slugify(body.slug);
  if (typeof body.category === "string") patch.category_slug = body.category;
  if (Number.isFinite(Number(body.priceCents))) patch.price_cents = Math.round(Number(body.priceCents));
  patch.compare_at_cents =
    body.compareAtCents == null || body.compareAtCents === ""
      ? null
      : Math.round(Number(body.compareAtCents));
  if (Array.isArray(body.badges)) patch.badges = body.badges;
  if (typeof body.blurb === "string") patch.blurb = body.blurb;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.engineSize === "string") patch.engine_size = body.engineSize;
  if (Array.isArray(body.specs)) patch.specs = body.specs;
  if (Array.isArray(body.boxContents)) patch.box_contents = body.boxContents;
  if (Array.isArray(body.features)) patch.features = body.features;
  if (typeof body.image === "string") patch.image = body.image;
  if (typeof body.featured === "boolean") patch.featured = body.featured;
  if (typeof body.inStock === "boolean") patch.in_stock = body.inStock;
  return patch;
}

adminRouter.post("/products", async (req, res) => {
  const patch = productPatchFromBody(req.body ?? {});
  if (!patch.name || !patch.category_slug || patch.price_cents == null) {
    return res.status(400).json({ error: "name, category, and priceCents are required" });
  }
  if (!patch.slug) patch.slug = slugify(patch.name as string);
  const { data, error } = await db().from("products").insert(patch).select("*").single();
  if (error) {
    const message = error.code === "23505" ? "A product with that slug already exists" : "Could not create product";
    return res.status(400).json({ error: message });
  }
  res.status(201).json(toProduct(data as ProductRow));
});

adminRouter.patch("/products/:id", async (req, res) => {
  const patch = productPatchFromBody(req.body ?? {});
  const { data, error } = await db().from("products").update(patch).eq("id", req.params.id).select("*").maybeSingle();
  if (error) return res.status(400).json({ error: "Could not update product" });
  if (!data) return res.status(404).json({ error: "Product not found" });
  res.json(toProduct(data as ProductRow));
});

adminRouter.delete("/products/:id", async (req, res) => {
  const { error } = await db().from("products").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not delete product" });
  res.json({ ok: true });
});

/** Image upload → Supabase Storage (public bucket). Body: base64 payload. */
adminRouter.post("/uploads", async (req, res) => {
  const filename = String(req.body?.filename ?? "upload.bin");
  const contentType = String(req.body?.contentType ?? "application/octet-stream");
  const dataBase64 = String(req.body?.dataBase64 ?? "");
  if (!dataBase64) return res.status(400).json({ error: "dataBase64 required" });
  if (!/^image\//.test(contentType)) return res.status(400).json({ error: "Only image uploads are allowed" });

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: "Max image size is 5MB" });

  const ext = filename.includes(".") ? filename.split(".").pop() : "png";
  // The timestamped path makes every upload a new URL, so the object is
  // immutable and safe to cache at the edge for a full year.
  const path = `${Date.now()}-${slugify(filename.replace(/\.[^.]+$/, "")) || "image"}.${ext}`;
  const { error } = await db().storage.from("product-images").upload(path, buffer, {
    contentType,
    cacheControl: String(env.imageCacheSeconds),
    upsert: false,
  });
  if (error) {
    console.error("upload failed", error);
    return res.status(500).json({ error: "Upload failed" });
  }
  const { data } = db().storage.from("product-images").getPublicUrl(path);
  res.json({ url: data.publicUrl, cacheSeconds: env.imageCacheSeconds, immutable: true });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

adminRouter.patch("/categories/:slug", async (req, res) => {
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name.trim();
  if (typeof req.body?.tagline === "string") patch.tagline = req.body.tagline;
  if (req.body?.badge !== undefined) patch.badge = req.body.badge || null;
  if (typeof req.body?.image === "string") patch.image = req.body.image;
  if (Number.isFinite(Number(req.body?.count))) patch.count = Number(req.body.count);
  const { error } = await db().from("categories").update(patch).eq("slug", req.params.slug);
  if (error) return res.status(500).json({ error: "Could not update category" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Discount codes
// ---------------------------------------------------------------------------

adminRouter.get("/discounts", async (_req, res) => {
  const { data } = await db().from("discount_codes").select("*").order("created_at", { ascending: false });
  res.json(data ?? []);
});

adminRouter.post("/discounts", async (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  const percentOff = Math.round(Number(req.body?.percentOff));
  if (!code || !(percentOff >= 1 && percentOff <= 100)) {
    return res.status(400).json({ error: "Code and percentOff (1–100) required" });
  }
  const { error } = await db().from("discount_codes").insert({ code, percent_off: percentOff, active: true });
  if (error) return res.status(400).json({ error: "Code already exists" });
  res.status(201).json({ ok: true });
});

adminRouter.patch("/discounts/:code", async (req, res) => {
  const { error } = await db()
    .from("discount_codes")
    .update({ active: Boolean(req.body?.active) })
    .eq("code", req.params.code);
  if (error) return res.status(500).json({ error: "Could not update code" });
  res.json({ ok: true });
});

adminRouter.delete("/discounts/:code", async (req, res) => {
  const { error } = await db().from("discount_codes").delete().eq("code", req.params.code);
  if (error) return res.status(500).json({ error: "Could not delete code" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Customers, subscribers, messages, testimonials
// ---------------------------------------------------------------------------

adminRouter.get("/customers", async (_req, res) => {
  const [profiles, orders] = await Promise.all([
    db().from("profiles").select("id, email, first_name, last_name, is_admin, created_at").order("created_at", { ascending: false }),
    db().from("orders").select("user_id, total_cents, payment_status"),
  ]);
  const byUser = new Map<string, { orders: number; spentCents: number }>();
  for (const o of orders.data ?? []) {
    if (!o.user_id) continue;
    const entry = byUser.get(o.user_id) ?? { orders: 0, spentCents: 0 };
    entry.orders += 1;
    if (o.payment_status === "paid") entry.spentCents += o.total_cents;
    byUser.set(o.user_id, entry);
  }
  res.json(
    (profiles.data ?? []).map((p) => ({
      ...p,
      orders: byUser.get(p.id)?.orders ?? 0,
      spent_cents: byUser.get(p.id)?.spentCents ?? 0,
    })),
  );
});

adminRouter.get("/subscribers", async (_req, res) => {
  const { data } = await db().from("newsletter_subscribers").select("*").order("created_at", { ascending: false });
  res.json(data ?? []);
});

adminRouter.delete("/subscribers/:email", async (req, res) => {
  const { error } = await db().from("newsletter_subscribers").delete().eq("email", req.params.email);
  if (error) return res.status(500).json({ error: "Could not remove subscriber" });
  res.json({ ok: true });
});

adminRouter.get("/messages", async (_req, res) => {
  const { data } = await db().from("contact_messages").select("*").order("created_at", { ascending: false });
  res.json(data ?? []);
});

adminRouter.patch("/messages/:id", async (req, res) => {
  const { error } = await db()
    .from("contact_messages")
    .update({ read: Boolean(req.body?.read) })
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not update message" });
  res.json({ ok: true });
});

adminRouter.delete("/messages/:id", async (req, res) => {
  const { error } = await db().from("contact_messages").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not delete message" });
  res.json({ ok: true });
});

adminRouter.get("/testimonials", async (_req, res) => {
  const { data } = await db().from("testimonials").select("*").order("sort_order");
  res.json(data ?? []);
});

adminRouter.post("/testimonials", async (req, res) => {
  const { name, initials, role, quote, rating } = req.body ?? {};
  if (!name || !quote) return res.status(400).json({ error: "name and quote required" });
  const { error } = await db().from("testimonials").insert({
    name,
    initials: initials || String(name).slice(0, 2).toUpperCase(),
    role: role || "Verified Buyer",
    quote,
    rating: Math.min(5, Math.max(1, Math.round(Number(rating) || 5))),
  });
  if (error) return res.status(500).json({ error: "Could not create testimonial" });
  res.status(201).json({ ok: true });
});

adminRouter.delete("/testimonials/:id", async (req, res) => {
  const { error } = await db().from("testimonials").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not delete testimonial" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Site settings (hero + announcements + contact + social)
// ---------------------------------------------------------------------------

adminRouter.get("/settings", async (_req, res) => {
  const { data } = await db().from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return res.status(404).json({ error: "Settings row missing — run supabase/seed.sql" });
  res.json({ hero: data.hero, announcements: data.announcements, contact: data.contact, social: data.social });
});

adminRouter.put("/settings", async (req, res) => {
  const { hero, announcements, contact, social } = req.body ?? {};
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (hero && typeof hero === "object") patch.hero = hero;
  if (Array.isArray(announcements)) patch.announcements = announcements.filter((a) => typeof a === "string" && a.trim());
  if (contact && typeof contact === "object") patch.contact = contact;
  if (social && typeof social === "object") patch.social = social;
  const { error } = await db().from("site_settings").update(patch).eq("id", 1);
  if (error) return res.status(500).json({ error: "Could not save settings" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// System — live status of every connected service (/admin/system)
// ---------------------------------------------------------------------------

interface ServiceReport {
  key: string;
  name: string;
  role: string;
  status: "ok" | "degraded" | "down" | "not_configured";
  detail: string;
  meta?: Record<string, unknown>;
  docs?: string;
}

async function checkSupabase(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "supabase",
    name: "Supabase",
    role: "Postgres database, auth, and file storage",
    status: "not_configured",
    detail: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.",
    docs: "https://supabase.com/dashboard",
  };
  if (!integrationStatus().supabase) return base;
  const started = Date.now();
  const { count, error } = await db().from("products").select("id", { count: "exact", head: true });
  if (error) {
    return { ...base, status: "down", detail: `Query failed: ${error.message}` };
  }
  return {
    ...base,
    status: "ok",
    detail: `Connected — ${count ?? 0} products, responded in ${Date.now() - started}ms.`,
    meta: { url: env.supabaseUrl, products: count ?? 0, latencyMs: Date.now() - started },
  };
}

async function checkStorage(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "storage",
    name: "Supabase Storage",
    role: "Product images, cached at the edge for one year",
    status: "not_configured",
    detail: "Supabase is not configured.",
  };
  if (!integrationStatus().supabase) return base;
  const { data, error } = await db().storage.from("product-images").list("", { limit: 1 });
  if (error) {
    return {
      ...base,
      status: "down",
      detail: `Bucket "product-images" unreachable: ${error.message}. Re-run migration 003.`,
    };
  }
  return {
    ...base,
    status: "ok",
    detail: `Bucket "product-images" is public and reachable. Uploads are cached for ${Math.round(
      env.imageCacheSeconds / 86400,
    )} days.`,
    meta: { bucket: "product-images", cacheSeconds: env.imageCacheSeconds, hasObjects: (data ?? []).length > 0 },
  };
}

async function checkStripe(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "stripe",
    name: "Stripe",
    role: "Hosted Checkout — payments are confirmed manually, no webhooks",
    status: "not_configured",
    detail: "STRIPE_SECRET_KEY is not set — checkout is disabled.",
    docs: "https://dashboard.stripe.com",
  };
  if (!stripeEnabled()) return base;
  const snapshot = await stripeAccountSnapshot();
  if (!snapshot.ok) {
    return { ...base, status: "down", detail: snapshot.error ?? "Stripe API unreachable." };
  }
  return {
    ...base,
    status: snapshot.chargesEnabled ? "ok" : "degraded",
    detail: snapshot.chargesEnabled
      ? `${stripeLiveMode() ? "Live" : "Test"} mode · charges enabled${
          snapshot.businessName ? ` · ${snapshot.businessName}` : ""
        }.`
      : "Connected, but charges are not enabled on this Stripe account yet.",
    meta: {
      accountId: snapshot.accountId,
      livemode: snapshot.livemode,
      chargesEnabled: snapshot.chargesEnabled,
      currency: env.stripeCurrency,
      webhooks: "disabled by design — payments are confirmed by an admin",
    },
  };
}

async function checkResend(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "resend",
    name: "Resend",
    role: "Every order, status change, and delivery update email",
    status: "not_configured",
    detail: "RESEND_API_KEY is not set — customers will not be emailed.",
    docs: "https://resend.com/domains",
  };
  if (!integrationStatus().resend) return base;
  const health = await resendHealth();
  if (!health.ok) return { ...base, status: "down", detail: health.error ?? "Resend unreachable." };
  const sendingDomain = env.emailFrom.match(/@([^>\s]+)/)?.[1] ?? "";
  const verified = (health.domains ?? []).some((d) => d.startsWith(sendingDomain));
  return {
    ...base,
    status: verified || (health.domains ?? []).length === 0 ? "ok" : "degraded",
    detail: verified
      ? `Sending as ${env.emailFrom} from a verified domain.`
      : `Sending as ${env.emailFrom}. Verified domains: ${(health.domains ?? []).join(", ") || "none listed"}.`,
    meta: { from: env.emailFrom, replyTo: env.emailReplyTo, domains: health.domains ?? [] },
  };
}

async function checkCron(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "cron",
    name: "Delivery update cron",
    role: `Progress emails on day ${env.deliveryUpdateDays.join(", ")} after payment`,
    status: "not_configured",
    detail: "CRON_SECRET is not set and the internal scheduler is off — no updates will be sent.",
  };
  const { data } = await db().from("system_state").select("*").eq("key", "delivery_cron").maybeSingle();
  const lastRun = data?.value?.ran_at as string | undefined;
  if (!env.cronSecret && !env.internalCron) return { ...base, meta: { lastRun } };

  const staleAfterMs = 36 * 60 * 60 * 1000;
  const isStale = !lastRun || Date.now() - new Date(lastRun).getTime() > staleAfterMs;
  return {
    ...base,
    status: isStale ? "degraded" : "ok",
    detail: lastRun
      ? `Last sweep ${new Date(lastRun).toISOString()} — checked ${data?.value?.checked ?? 0}, sent ${
          data?.value?.sent ?? 0
        }.${isStale ? " That is over 36h ago; check the Cloudflare cron Worker." : ""}`
      : "Configured, but it has never run. Deploy workers/cron or enable ENABLE_INTERNAL_CRON.",
    meta: {
      milestones: env.deliveryUpdateDays,
      lastRun,
      internalScheduler: env.internalCron,
      endpoint: "/api/cron/delivery-updates",
      secretConfigured: Boolean(env.cronSecret),
    },
  };
}

async function checkFrontend(): Promise<ServiceReport> {
  const base: ServiceReport = {
    key: "frontend",
    name: "Cloudflare Workers",
    role: "The storefront — Next.js on Workers via OpenNext",
    status: "not_configured",
    detail: "FRONTEND_URL is not set.",
    docs: "https://dash.cloudflare.com",
  };
  if (!env.frontendUrl) return base;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const started = Date.now();
    const res = await fetch(env.frontendUrl, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    return {
      ...base,
      status: res.ok ? "ok" : "degraded",
      detail: `${env.frontendUrl} responded ${res.status} in ${Date.now() - started}ms.`,
      meta: {
        url: env.frontendUrl,
        cdn: res.headers.get("server") ?? undefined,
        corsOrigins: env.corsOrigins,
      },
    };
  } catch (err) {
    return {
      ...base,
      status: "down",
      detail: `${env.frontendUrl} did not respond: ${err instanceof Error ? err.message : "unknown error"}`,
      meta: { url: env.frontendUrl },
    };
  }
}

adminRouter.get("/system", async (_req, res) => {
  const [supabaseReport, storage, stripeReport, resend, cron, frontend] = await Promise.all([
    checkSupabase(),
    checkStorage(),
    checkStripe(),
    checkResend(),
    checkCron(),
    checkFrontend(),
  ]);
  const services = [supabaseReport, stripeReport, resend, storage, cron, frontend];
  const worst = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "not_configured" || s.status === "degraded")
      ? "degraded"
      : "ok";

  res.json({
    overall: worst,
    checkedAt: new Date().toISOString(),
    services,
    app: {
      brand: env.brandName,
      domain: env.brandDomain,
      frontendUrl: env.frontendUrl,
      environment: env.nodeEnv,
      supportEmail: env.supportEmail,
      adminEmail: env.adminEmail,
      emailFrom: env.emailFrom,
      deliveryWindowDays: { min: env.deliveryMinDays, max: env.deliveryMaxDays },
      deliveryUpdateDays: env.deliveryUpdateDays,
      manualPaymentApproval: true,
      stripeWebhooks: false,
      orderStatuses: ORDER_STATUSES,
      paidStatuses: PAID_STATUSES,
    },
  });
});

/** Run the delivery-update sweep on demand from the System page. */
adminRouter.post("/system/run-delivery-cron", async (_req, res) => {
  try {
    const result = await runDeliveryUpdates();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("manual delivery sweep failed", err);
    res.status(500).json({ error: "Sweep failed" });
  }
});
