import { Router } from "express";
import { db, requireDb, toProduct, type ProductRow } from "../supabase";
import { sendContactNotification, sendNewsletterWelcome } from "../email";

export const publicRouter = Router();
publicRouter.use(requireDb);

publicRouter.get("/products", async (req, res) => {
  const { category, featured } = req.query as { category?: string; featured?: string };
  let query = db().from("products").select("*").order("name");
  if (category) query = query.eq("category_slug", category);
  if (featured === "true") query = query.eq("featured", true);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load products" });
  res.json((data as ProductRow[]).map(toProduct));
});

publicRouter.get("/products/:slug", async (req, res) => {
  const { data, error } = await db().from("products").select("*").eq("slug", req.params.slug).maybeSingle();
  if (error) return res.status(500).json({ error: "Could not load product" });
  if (!data) return res.status(404).json({ error: "Product not found" });
  res.json(toProduct(data as ProductRow));
});

publicRouter.get("/categories", async (_req, res) => {
  const { data, error } = await db().from("categories").select("*").order("sort_order");
  if (error) return res.status(500).json({ error: "Could not load categories" });
  res.json(
    (data ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      badge: c.badge ?? undefined,
      count: c.count,
      image: c.image,
    })),
  );
});

publicRouter.get("/testimonials", async (_req, res) => {
  const { data, error } = await db().from("testimonials").select("*").order("sort_order");
  if (error) return res.status(500).json({ error: "Could not load testimonials" });
  res.json(
    (data ?? []).map((t) => ({ name: t.name, initials: t.initials, role: t.role, quote: t.quote, rating: t.rating })),
  );
});

publicRouter.get("/settings", async (_req, res) => {
  const { data, error } = await db().from("site_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return res.status(500).json({ error: "Could not load settings" });
  res.json({
    hero: data.hero,
    announcements: data.announcements,
    contact: data.contact,
    social: data.social,
  });
});

export async function lookupDiscount(code: string): Promise<number | null> {
  const normalized = code.trim().toUpperCase();
  const { data } = await db()
    .from("discount_codes")
    .select("percent_off, active")
    .eq("code", normalized)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data.percent_off;
}

publicRouter.post("/discounts/validate", async (req, res) => {
  const code = String(req.body?.code ?? "");
  if (!code) return res.status(400).json({ error: "Code required" });
  const percentOff = await lookupDiscount(code);
  if (percentOff == null) return res.status(404).json({ error: "Invalid or expired code" });
  res.json({ code: code.trim().toUpperCase(), percentOff });
});

publicRouter.post("/newsletter", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email required" });
  }
  const { error } = await db().from("newsletter_subscribers").upsert({ email }, { onConflict: "email" });
  if (error) return res.status(500).json({ error: "Subscription failed" });
  void sendNewsletterWelcome(email);
  res.json({ ok: true, message: "You're in. Welcome to the Nation." });
});

publicRouter.post("/contact", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Name, valid email, and message are required" });
  }
  const { error } = await db().from("contact_messages").insert({ name, email, subject, message });
  if (error) return res.status(500).json({ error: "Could not send message" });
  void sendContactNotification({ name, email, subject, message });
  res.json({ ok: true, message: "Message received — the garage replies within one business day." });
});
