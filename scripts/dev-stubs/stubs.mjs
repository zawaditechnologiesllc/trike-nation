/**
 * Local service stubs for end-to-end testing without live credentials:
 *   :4600 Supabase (PostgREST subset + GoTrue auth + Storage)
 *   :4601 Stripe   (coupons, checkout sessions, hosted pay page, signed webhooks)
 *   :4602 PayPal   (oauth, orders create/capture, approval page)
 *   :4603 Resend   (email capture; GET /sent lists captured emails)
 *
 * Not used in production — the real services are configured via env vars.
 * Run with: node scripts/dev-stubs/stubs.mjs
 */
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = JSON.parse(readFileSync(join(root, "data", "catalog.json"), "utf8"));
const siteSettings = JSON.parse(readFileSync(join(root, "data", "site-settings.json"), "utf8"));

const BACKEND_URL = process.env.STUB_BACKEND_URL ?? "http://localhost:4700";
const WEBHOOK_SECRET = process.env.STUB_STRIPE_WEBHOOK_SECRET ?? "whsec_stub";

// ---------------------------------------------------------------------------
// In-memory database seeded like supabase/seed.sql
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();

const USERS = {
  "admin-token": { id: "00000000-0000-4000-8000-000000000001", email: "admin@gocartgrip.shop" },
  "rider-token": { id: "00000000-0000-4000-8000-000000000002", email: "rider@example.com" },
};
const PASSWORDS = {
  "admin@gocartgrip.shop": { password: "admin-pass-123", token: "admin-token" },
  "rider@example.com": { password: "rider-pass-123", token: "rider-token" },
};

const tables = {
  categories: catalog.categories.map((c, i) => ({
    slug: c.slug, name: c.name, tagline: c.tagline, badge: c.badge ?? null, count: c.count, image: c.image, sort_order: i,
  })),
  products: catalog.products.map((p) => ({
    id: randomUUID(), slug: p.slug, name: p.name, category_slug: p.category, price_cents: p.priceCents,
    compare_at_cents: p.compareAtCents ?? null, badges: p.badges, blurb: p.blurb, description: p.description,
    engine_size: p.engineSize, specs: p.specs, box_contents: p.boxContents, features: p.features,
    image: p.image, featured: p.featured, in_stock: p.inStock, created_at: now(),
  })),
  testimonials: catalog.testimonials.map((t, i) => ({
    id: randomUUID(), name: t.name, initials: t.initials, role: t.role, quote: t.quote, rating: t.rating, sort_order: i,
  })),
  discount_codes: Object.entries(catalog.discountCodes).map(([code, pct]) => ({
    code, percent_off: pct, active: true, created_at: now(),
  })),
  newsletter_subscribers: [],
  site_settings: [{ id: 1, ...siteSettings, updated_at: now() }],
  profiles: [
    { id: USERS["admin-token"].id, email: "admin@gocartgrip.shop", first_name: null, last_name: null, is_admin: true, created_at: now() },
    { id: USERS["rider-token"].id, email: "rider@example.com", first_name: null, last_name: null, is_admin: false, created_at: now() },
  ],
  orders: [],
  order_items: [],
  contact_messages: [],
};

const DEFAULTS = {
  orders: () => ({ id: randomUUID(), created_at: now(), status: "pending_payment", payment_status: "unpaid", payment_provider: null, payment_ref: null, tracking_number: null, admin_notes: null, discount_code: null, user_id: null }),
  order_items: () => ({ id: randomUUID() }),
  products: () => ({ id: randomUUID(), created_at: now(), compare_at_cents: null, badges: [], blurb: "", description: "", engine_size: "N/A", specs: [], box_contents: [], features: [], image: "", featured: false, in_stock: true }),
  contact_messages: () => ({ id: randomUUID(), read: false, created_at: now(), subject: "" }),
  newsletter_subscribers: () => ({ created_at: now() }),
  discount_codes: () => ({ active: true, created_at: now() }),
  testimonials: () => ({ id: randomUUID(), sort_order: 99 }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res, body) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><html><body style="background:#0f0f0f;color:#f5f5f7;font-family:monospace;padding:40px">${body}</body></html>`);
}

// ---------------------------------------------------------------------------
// Supabase stub (:4600)
// ---------------------------------------------------------------------------

function applyFilters(rows, params) {
  let out = [...rows];
  for (const [key, value] of params) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(key)) continue;
    if (value.startsWith("eq.")) {
      const want = value.slice(3);
      out = out.filter((r) => String(r[key]) === want);
    }
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

function respondRows(req, res, rows, status = 200) {
  const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object+json");
  if (!single) return json(res, status, rows);
  if (rows.length === 1) return json(res, status, rows[0]);
  return json(res, 406, {
    code: "PGRST116",
    details: `The result contains ${rows.length} rows`,
    hint: null,
    message: "JSON object requested, multiple (or no) rows returned",
  });
}

const supabaseStub = createServer(async (req, res) => {
  // Browser clients (the storefront) call this cross-origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, "http://localhost");
  const body = await readBody(req);

  // --- auth ---
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    const creds = JSON.parse(body.toString() || "{}");
    const record = PASSWORDS[creds.email];
    if (!record || record.password !== creds.password) {
      return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    const user = USERS[record.token];
    return json(res, 200, {
      access_token: record.token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `${record.token}-refresh`,
      user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, created_at: now(), app_metadata: {}, user_metadata: {} },
    });
  }
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const token = String(req.headers.authorization ?? "").replace("Bearer ", "");
    const user = USERS[token];
    if (!user) return json(res, 401, { message: "invalid token" });
    return json(res, 200, { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, created_at: now(), app_metadata: {}, user_metadata: {} });
  }
  if (url.pathname === "/auth/v1/logout") return json(res, 204, {});

  // --- storage ---
  if (url.pathname.startsWith("/storage/v1/object/") && req.method === "POST") {
    const path = url.pathname.replace("/storage/v1/object/", "");
    return json(res, 200, { Key: path, path: path.split("/").slice(1).join("/") });
  }
  if (url.pathname.startsWith("/storage/v1/object/public/")) {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  }

  // --- postgrest ---
  const match = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!match) return json(res, 404, { message: `no route ${req.method} ${url.pathname}` });
  const table = tables[match[1]];
  if (!table) return json(res, 404, { message: `unknown table ${match[1]}` });
  const params = url.searchParams;
  const prefer = String(req.headers.prefer ?? "");

  if (req.method === "GET") {
    return respondRows(req, res, applyFilters(table, params));
  }
  if (req.method === "POST") {
    const payload = JSON.parse(body.toString() || "{}");
    const rows = Array.isArray(payload) ? payload : [payload];
    const inserted = [];
    for (const row of rows) {
      if (prefer.includes("resolution=merge-duplicates")) {
        const conflictKey = params.get("on_conflict") ?? "id";
        const existing = table.find((r) => r[conflictKey] === row[conflictKey]);
        if (existing) {
          Object.assign(existing, row);
          inserted.push(existing);
          continue;
        }
      }
      const withDefaults = { ...(DEFAULTS[match[1]]?.() ?? {}), ...row };
      // unique key checks for realistic conflict errors
      if (match[1] === "products" && table.some((r) => r.slug === withDefaults.slug)) {
        return json(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      if (match[1] === "discount_codes" && table.some((r) => r.code === withDefaults.code)) {
        return json(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      table.push(withDefaults);
      inserted.push(withDefaults);
    }
    if (prefer.includes("return=representation")) return respondRows(req, res, inserted, 201);
    res.writeHead(201);
    return res.end();
  }
  if (req.method === "PATCH") {
    const payload = JSON.parse(body.toString() || "{}");
    const rows = applyFilters(table, params);
    rows.forEach((row) => Object.assign(row, payload));
    if (prefer.includes("return=representation")) return respondRows(req, res, rows);
    res.writeHead(204);
    return res.end();
  }
  if (req.method === "DELETE") {
    const doomed = new Set(applyFilters(table, params));
    tables[match[1]] = table.filter((r) => !doomed.has(r));
    res.writeHead(204);
    return res.end();
  }
  json(res, 405, { message: "method not allowed" });
});

// ---------------------------------------------------------------------------
// Stripe stub (:4601)
// ---------------------------------------------------------------------------

const stripeSessions = new Map();

const stripeStub = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const body = (await readBody(req)).toString();

  if (url.pathname === "/v1/coupons" && req.method === "POST") {
    return json(res, 200, { id: `coup_${Date.now()}`, object: "coupon" });
  }
  if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
    const form = new URLSearchParams(body);
    const id = `cs_test_${Date.now()}`;
    stripeSessions.set(id, {
      orderId: form.get("metadata[order_id]"),
      successUrl: form.get("success_url"),
      cancelUrl: form.get("cancel_url"),
    });
    return json(res, 200, { id, object: "checkout.session", url: `http://localhost:4601/pay/${id}` });
  }
  const payMatch = url.pathname.match(/^\/pay\/(cs_test_\w+)$/);
  if (payMatch && req.method === "GET") {
    return html(
      res,
      `<h1>STRIPE CHECKOUT (STUB)</h1>
       <form method="POST" action="/pay/${payMatch[1]}/complete"><button id="pay" style="padding:16px 32px;background:#b31d28;color:#fff;border:0;font-size:18px">PAY NOW</button></form>`,
    );
  }
  const completeMatch = url.pathname.match(/^\/pay\/(cs_test_\w+)\/complete$/);
  if (completeMatch && req.method === "POST") {
    const session = stripeSessions.get(completeMatch[1]);
    const payload = JSON.stringify({
      id: `evt_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: completeMatch[1], object: "checkout.session", metadata: { order_id: session.orderId } } },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
    await fetch(`${BACKEND_URL}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": `t=${t},v1=${sig}` },
      body: payload,
    }).catch((err) => console.error("[stripe-stub] webhook delivery failed", err));
    res.writeHead(303, { Location: session.successUrl });
    return res.end();
  }
  json(res, 404, { error: { message: `no stub for ${req.method} ${url.pathname}` } });
});

// ---------------------------------------------------------------------------
// PayPal stub (:4602)
// ---------------------------------------------------------------------------

const paypalOrders = new Map();

const paypalStub = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const body = (await readBody(req)).toString();

  if (url.pathname === "/v1/oauth2/token") {
    return json(res, 200, { access_token: "pp_stub_token", token_type: "Bearer", expires_in: 3600 });
  }
  if (url.pathname === "/v2/checkout/orders" && req.method === "POST") {
    const payload = JSON.parse(body);
    const id = `PPORD${Date.now()}`;
    const unit = payload.purchase_units[0];
    paypalOrders.set(id, {
      customId: unit.custom_id,
      returnUrl: payload.payment_source.paypal.experience_context.return_url,
    });
    return json(res, 201, {
      id,
      status: "PAYER_ACTION_REQUIRED",
      links: [{ rel: "payer-action", href: `http://localhost:4602/approve/${id}` }],
    });
  }
  const approveMatch = url.pathname.match(/^\/approve\/(PPORD\w+)$/);
  if (approveMatch && req.method === "GET") {
    return html(
      res,
      `<h1>PAYPAL (STUB)</h1>
       <form method="POST" action="/approve/${approveMatch[1]}/confirm"><button id="approve" style="padding:16px 32px;background:#0070ba;color:#fff;border:0;font-size:18px">APPROVE PAYMENT</button></form>`,
    );
  }
  const confirmMatch = url.pathname.match(/^\/approve\/(PPORD\w+)\/confirm$/);
  if (confirmMatch && req.method === "POST") {
    const order = paypalOrders.get(confirmMatch[1]);
    const sep = order.returnUrl.includes("?") ? "&" : "?";
    res.writeHead(303, { Location: `${order.returnUrl}${sep}token=${confirmMatch[1]}&PayerID=STUBPAYER` });
    return res.end();
  }
  const captureMatch = url.pathname.match(/^\/v2\/checkout\/orders\/(PPORD\w+)\/capture$/);
  if (captureMatch && req.method === "POST") {
    const order = paypalOrders.get(captureMatch[1]);
    if (!order) return json(res, 404, { message: "order not found" });
    return json(res, 201, {
      id: captureMatch[1],
      status: "COMPLETED",
      purchase_units: [{ custom_id: order.customId, payments: { captures: [{ id: `CAP${Date.now()}`, custom_id: order.customId }] } }],
    });
  }
  json(res, 404, { message: `no stub for ${req.method} ${url.pathname}` });
});

// ---------------------------------------------------------------------------
// Resend stub (:4603)
// ---------------------------------------------------------------------------

const sentEmails = [];

const resendStub = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/emails" && req.method === "POST") {
    const email = JSON.parse((await readBody(req)).toString());
    sentEmails.push(email);
    console.log(`[resend-stub] "${email.subject}" -> ${email.to}`);
    return json(res, 200, { id: `email_${Date.now()}` });
  }
  if (url.pathname === "/sent") return json(res, 200, sentEmails);
  json(res, 404, {});
});

supabaseStub.listen(4600, () => console.log("supabase stub :4600"));
stripeStub.listen(4601, () => console.log("stripe stub   :4601"));
paypalStub.listen(4602, () => console.log("paypal stub   :4602"));
resendStub.listen(4603, () => console.log("resend stub   :4603"));
