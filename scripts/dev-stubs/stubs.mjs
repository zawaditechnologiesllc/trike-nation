/**
 * Local service stubs for end-to-end testing without live credentials:
 *   :4600 Supabase (PostgREST subset + GoTrue auth + Storage)
 *   :4601 Stripe   (coupons, checkout sessions, hosted pay page, session reads)
 *   :4603 Resend   (email capture; GET /sent lists captured emails)
 *
 * There is no webhook stub: production runs without Stripe webhooks. Paying on
 * the stub checkout page marks the session paid and redirects back, and the
 * backend reads that state with a session retrieve — same as live.
 *
 * Not used in production — the real services are configured via env vars.
 * Run with: node scripts/dev-stubs/stubs.mjs
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = JSON.parse(readFileSync(join(root, "data", "catalog.json"), "utf8"));
const siteSettings = JSON.parse(readFileSync(join(root, "data", "site-settings.json"), "utf8"));


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
      // The real success_url carries {CHECKOUT_SESSION_ID}; substitute it the
      // way Stripe does so the app gets a usable session id back.
      successUrl: (form.get("success_url") ?? "").replace("{CHECKOUT_SESSION_ID}", id),
      cancelUrl: form.get("cancel_url"),
      amountTotal: Number(form.get("line_items[0][price_data][unit_amount]") ?? 0),
      customerEmail: form.get("customer_email"),
      paymentStatus: "unpaid",
      status: "open",
    });
    return json(res, 200, { id, object: "checkout.session", url: `http://localhost:4601/pay/${id}` });
  }
  // Session retrieve — this is what replaces webhook delivery.
  const retrieveMatch = url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_test_\w+)$/);
  if (retrieveMatch && req.method === "GET") {
    const session = stripeSessions.get(retrieveMatch[1]);
    if (!session) return json(res, 404, { error: { message: "No such checkout session" } });
    const intentId = `pi_stub_${retrieveMatch[1].slice(-8)}`;
    return json(res, 200, {
      id: retrieveMatch[1],
      object: "checkout.session",
      payment_status: session.paymentStatus,
      status: session.status,
      amount_total: session.amountTotal,
      currency: "usd",
      client_reference_id: session.orderId,
      metadata: { order_id: session.orderId },
      customer_email: session.customerEmail,
      customer_details: { email: session.customerEmail },
      payment_intent:
        session.paymentStatus === "paid"
          ? {
              id: intentId,
              object: "payment_intent",
              latest_charge: {
                id: `ch_stub_${retrieveMatch[1].slice(-8)}`,
                object: "charge",
                receipt_url: `http://localhost:4601/receipt/${retrieveMatch[1]}`,
              },
            }
          : null,
    });
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
    // No webhook is fired: the app finds out by reading the session back.
    session.paymentStatus = "paid";
    session.status = "complete";
    console.log(`[stripe-stub] session ${completeMatch[1]} marked paid`);
    res.writeHead(303, { Location: session.successUrl });
    return res.end();
  }
  const receiptMatch = url.pathname.match(/^\/receipt\/(cs_test_\w+)$/);
  if (receiptMatch && req.method === "GET") {
    return html(res, `<h1>STRIPE RECEIPT (STUB)</h1><p>Session ${receiptMatch[1]}</p>`);
  }
  json(res, 404, { error: { message: `no stub for ${req.method} ${url.pathname}` } });
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
resendStub.listen(4603, () => console.log("resend stub   :4603"));
