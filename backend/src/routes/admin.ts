import { Router } from "express";
import { db, requireDb, toProduct, type ProductRow } from "../supabase";
import { requireAdmin } from "../auth";
import { sendOrderShipped } from "../email";

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
    db().from("orders").select("id, status, payment_status, total_cents, created_at, email"),
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
    ordersAwaitingFulfilment: all.filter((o) => ["paid", "processing"].includes(o.status)).length,
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
        totalCents: o.total_cents,
        createdAt: o.created_at,
      })),
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"];

adminRouter.get("/orders", async (req, res) => {
  const status = req.query.status as string | undefined;
  let query = db()
    .from("orders")
    .select("id, email, status, payment_status, payment_provider, total_cents, discount_code, tracking_number, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && ORDER_STATUSES.includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load orders" });
  res.json(data ?? []);
});

adminRouter.get("/orders/:id", async (req, res) => {
  const { data: order } = await db().from("orders").select("*").eq("id", req.params.id).maybeSingle();
  if (!order) return res.status(404).json({ error: "Order not found" });
  const { data: items } = await db()
    .from("order_items")
    .select("product_slug, product_name, unit_price_cents, qty")
    .eq("order_id", order.id);
  res.json({ ...order, items: items ?? [] });
});

adminRouter.patch("/orders/:id", async (req, res) => {
  const status = req.body?.status as string | undefined;
  const trackingNumber = req.body?.trackingNumber as string | undefined;
  const adminNotes = req.body?.adminNotes as string | undefined;

  if (status && !ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status" });

  const { data: existing } = await db()
    .from("orders")
    .select("id, email, status, tracking_number")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: "Order not found" });

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (trackingNumber !== undefined) patch.tracking_number = trackingNumber || null;
  if (adminNotes !== undefined) patch.admin_notes = adminNotes || null;
  if (status === "refunded") patch.payment_status = "refunded";

  const { error } = await db().from("orders").update(patch).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Could not update order" });

  // Notify the customer when the machine leaves the dock.
  if (status === "shipped" && existing.status !== "shipped") {
    void sendOrderShipped(existing.email, existing.id, trackingNumber ?? existing.tracking_number ?? null);
  }
  res.json({ ok: true });
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
  const path = `${Date.now()}-${slugify(filename.replace(/\.[^.]+$/, "")) || "image"}.${ext}`;
  const { error } = await db().storage.from("product-images").upload(path, buffer, { contentType });
  if (error) {
    console.error("upload failed", error);
    return res.status(500).json({ error: "Upload failed" });
  }
  const { data } = db().storage.from("product-images").getPublicUrl(path);
  res.json({ url: data.publicUrl });
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
