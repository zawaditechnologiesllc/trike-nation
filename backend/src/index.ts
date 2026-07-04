import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import catalog from "./catalog.json";

const PORT = Number(process.env.PORT ?? 4000);

// Comma-separated list of allowed origins, e.g. the Vercel URL.
const corsOrigins = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Service-role client for reads/writes that bypass RLS (orders, newsletter).
 * When Supabase is not configured the API falls back to the bundled catalog
 * snapshot so it stays usable in demo deployments.
 */
const supabase: SupabaseClient | null =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: corsOrigins.includes("*") ? true : corsOrigins,
  }),
);

interface ProductRow {
  slug: string;
  name: string;
  category_slug: string;
  price_cents: number;
  compare_at_cents: number | null;
  badges: string[];
  blurb: string;
  description: string;
  engine_size: string;
  specs: { label: string; value: string }[];
  box_contents: string[];
  features: { title: string; text: string }[];
  image: string;
  featured: boolean;
  in_stock: boolean;
}

function toProduct(row: ProductRow) {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category_slug,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents ?? undefined,
    badges: row.badges ?? [],
    blurb: row.blurb,
    description: row.description,
    engineSize: row.engine_size,
    specs: row.specs ?? [],
    boxContents: row.box_contents ?? [],
    features: row.features ?? [],
    image: row.image,
    featured: row.featured,
    inStock: row.in_stock,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, supabase: Boolean(supabase) });
});

app.get("/api/products", async (req, res) => {
  const { category, featured } = req.query as { category?: string; featured?: string };
  if (supabase) {
    let query = supabase.from("products").select("*").order("name");
    if (category) query = query.eq("category_slug", category);
    if (featured === "true") query = query.eq("featured", true);
    const { data, error } = await query;
    if (!error && data) return res.json(data.map((row) => toProduct(row as ProductRow)));
  }
  let list = catalog.products;
  if (category) list = list.filter((p) => p.category === category);
  if (featured === "true") list = list.filter((p) => p.featured);
  res.json(list);
});

app.get("/api/products/:slug", async (req, res) => {
  if (supabase) {
    const { data } = await supabase.from("products").select("*").eq("slug", req.params.slug).maybeSingle();
    if (data) return res.json(toProduct(data as ProductRow));
  }
  const product = catalog.products.find((p) => p.slug === req.params.slug);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

app.get("/api/categories", async (_req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from("categories").select("*").order("sort_order");
    if (!error && data && data.length) {
      return res.json(
        data.map((c) => ({
          slug: c.slug,
          name: c.name,
          tagline: c.tagline,
          badge: c.badge ?? undefined,
          count: c.count,
          image: c.image,
        })),
      );
    }
  }
  res.json(catalog.categories);
});

app.get("/api/testimonials", async (_req, res) => {
  if (supabase) {
    const { data, error } = await supabase.from("testimonials").select("*").order("sort_order");
    if (!error && data && data.length) {
      return res.json(
        data.map((t) => ({
          name: t.name,
          initials: t.initials,
          role: t.role,
          quote: t.quote,
          rating: t.rating,
        })),
      );
    }
  }
  res.json(catalog.testimonials);
});

async function lookupDiscount(code: string): Promise<number | null> {
  const normalized = code.trim().toUpperCase();
  if (supabase) {
    const { data } = await supabase
      .from("discount_codes")
      .select("percent_off, active")
      .eq("code", normalized)
      .maybeSingle();
    if (data) return data.active ? data.percent_off : null;
  }
  const codes = catalog.discountCodes as Record<string, number>;
  return codes[normalized] ?? null;
}

app.post("/api/discounts/validate", async (req, res) => {
  const code = String(req.body?.code ?? "");
  if (!code) return res.status(400).json({ error: "Code required" });
  const percentOff = await lookupDiscount(code);
  if (percentOff == null) return res.status(404).json({ error: "Invalid or expired code" });
  res.json({ code: code.trim().toUpperCase(), percentOff });
});

app.post("/api/newsletter", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }
  if (!supabase) {
    return res.json({ ok: true, message: "You're in. Welcome to the Nation. (demo mode)" });
  }
  const { error } = await supabase.from("newsletter_subscribers").upsert({ email }, { onConflict: "email" });
  if (error) return res.status(500).json({ error: "Subscription failed" });
  res.json({ ok: true, message: "You're in. Welcome to the Nation." });
});

interface OrderItemInput {
  slug: string;
  qty: number;
}

app.post("/api/orders", async (req, res) => {
  const items = (req.body?.items ?? []) as OrderItemInput[];
  const shipping = req.body?.shipping ?? {};
  const discountCode = req.body?.discountCode ? String(req.body.discountCode).toUpperCase() : undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }
  for (const field of ["firstName", "lastName", "address", "city", "zip", "phone", "email"]) {
    if (!shipping[field]) return res.status(400).json({ error: `Missing shipping field: ${field}` });
  }

  // Resolve the authenticated user (optional — guest checkout is allowed).
  let userId: string | null = null;
  const authHeader = req.headers.authorization;
  if (supabase && authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    userId = data.user?.id ?? null;
  }

  // Price everything server-side; never trust client totals.
  const priced: { slug: string; name: string; unitCents: number; qty: number; productId?: string }[] = [];
  for (const item of items) {
    const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1)));
    if (supabase) {
      const { data } = await supabase
        .from("products")
        .select("id, name, price_cents")
        .eq("slug", item.slug)
        .maybeSingle();
      if (data) {
        priced.push({ slug: item.slug, name: data.name, unitCents: data.price_cents, qty, productId: data.id });
        continue;
      }
    }
    const local = catalog.products.find((p) => p.slug === item.slug);
    if (!local) return res.status(400).json({ error: `Unknown product: ${item.slug}` });
    priced.push({ slug: item.slug, name: local.name, unitCents: local.priceCents, qty });
  }

  const subtotalCents = priced.reduce((sum, p) => sum + p.unitCents * p.qty, 0);
  const percentOff = discountCode ? ((await lookupDiscount(discountCode)) ?? 0) : 0;
  const discountCents = Math.round((subtotalCents * percentOff) / 100);
  const totalCents = subtotalCents - discountCents;

  if (!supabase) {
    return res.json({
      id: `DEMO-${Date.now().toString(36).toUpperCase()}`,
      status: "demo",
      subtotalCents,
      discountCents,
      totalCents,
      discountCode: percentOff ? discountCode : undefined,
      demo: true,
    });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      email: shipping.email,
      shipping,
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      total_cents: totalCents,
      discount_code: percentOff ? discountCode : null,
      status: "pending",
    })
    .select("id")
    .single();
  if (orderError || !order) {
    console.error("order insert failed", orderError);
    return res.status(500).json({ error: "Could not place order" });
  }

  const { error: itemsError } = await supabase.from("order_items").insert(
    priced.map((p) => ({
      order_id: order.id,
      product_id: p.productId ?? null,
      product_slug: p.slug,
      product_name: p.name,
      unit_price_cents: p.unitCents,
      qty: p.qty,
    })),
  );
  if (itemsError) {
    console.error("order items insert failed", itemsError);
    await supabase.from("orders").delete().eq("id", order.id);
    return res.status(500).json({ error: "Could not place order" });
  }

  res.json({
    id: order.id,
    status: "pending",
    subtotalCents,
    discountCents,
    totalCents,
    discountCode: percentOff ? discountCode : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`Trike Nation API listening on :${PORT} (supabase: ${supabase ? "connected" : "demo mode"})`);
});
