# Go Cart Grip

Production e-commerce platform for handcrafted mini trikes, drift karts, mini bikes, and quads,
running on **gocartgrip.shop**. Apex Rugged design system: dark "Stealth & Fire" palette, Anton
display type, Manrope body, JetBrains Mono technical labels.

## Architecture

| Piece    | Tech                                                    | Runs on            | Directory       |
| -------- | ------------------------------------------------------- | ------------------ | --------------- |
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4, via OpenNext   | Cloudflare Workers | `frontend/`     |
| Backend  | Express + TypeScript REST API                            | Render             | `backend/`      |
| DB/Auth  | Supabase — Postgres, email/password auth, Storage        | Supabase           | `supabase/`     |
| Email    | Resend — every order event, delivery update, and invite  | —                  | —               |
| Payments | Stripe hosted Checkout — **no webhooks**                 | —                  | —               |
| Cron     | Scheduled Worker → day 7/12/20 delivery updates          | Cloudflare Workers | `workers/cron/` |

All storefront data is served by the backend from Supabase — there is no synthetic fallback data.
If the API is unreachable the storefront renders graceful empty/error states.

### Payments are confirmed by a human

Stripe's webhook delivery is not trusted here, so it is not used at all. There is no webhook
endpoint and no signing secret. Instead:

```
checkout → POST /api/orders (server-side pricing + discount validation)
         → order row (pending_payment) + Stripe Checkout Session
         → customer pays on Stripe's hosted page
         → returns to /checkout/success?order=<id>&session_id=<cs_…>
         → POST /api/orders/:id/sync  ← the backend PULLS the session from Stripe
         → order becomes awaiting_confirmation, and an admin is emailed
         → admin reviews it in /admin/orders and clicks "Confirm Payment as Paid"
         → order becomes paid  →  customer emailed  →  order linked to their account
         → admin fulfils: processing → shipped (tracking) → delivered
           (or cancelled / refunded)
```

Amounts are always computed server-side from the database; client totals are never trusted. The
sync records exactly what Stripe reports — payment status, amount, payment intent, receipt URL —
and flags an amount mismatch, but it can never mark an order paid on its own.

### Customer notifications (Resend)

Every order event emails the customer, and every send is recorded on the order's timeline
(`order_events`) so you can see what was sent, when, and whether it landed.

| Trigger                       | Email                                                  |
| ----------------------------- | ------------------------------------------------------ |
| Order placed                  | "We've got your order" + the admin gets an alert        |
| Returned from Stripe          | "Payment received, verifying"                           |
| **Admin confirms payment**    | "Payment confirmed" + account invite if they're a guest |
| Any status change             | Tailored copy per status, plus an optional admin note   |
| Shipped                       | Tracking number                                         |
| Day 7 / 12 / 20 after payment | Delivery progress (cron)                                |
| Cancelled / refunded          | What happens to their money                             |

### Guest orders become accounts

Delivery is 12–30 days, so buyers need somewhere to watch the order. When an admin confirms a
payment:

- if an account already exists with the order's email → the order is linked to it immediately;
- if not → the buyer is emailed an invitation to create one, prefilled with that address.

The link happens three ways, so it cannot be missed: a Postgres trigger on profile creation
(migration 003), the `/api/orders/claim` endpoint the frontend calls after sign-in/sign-up, and a
claim pass every time the account order list is loaded. Row Level Security also matches orders by
the signed-in user's email, so a guest order is visible the moment they sign up.

### Delivery update cron

`workers/cron` is a Cloudflare scheduled Worker that calls
`POST /api/cron/delivery-updates` daily with `CRON_SECRET`. The backend emails every in-flight
order (paid, processing, or shipped) its day 7 / 12 / 20 progress update. Milestones are recorded
on the order, so the sweep is idempotent and a late run never replays older milestones.

### Admin panel — `/admin`

Access requires a signed-in user whose profile has `is_admin = true` (`supabase/make-admin.sql`).

- **Dashboard** — revenue, the payments-to-confirm queue, fulfilment counts, recent orders
- **Paid Orders** — confirmed payments only, with revenue totals by range and CSV export
- **All Orders** — filter by status (including "needs action"), search by email; detail view with
  confirm-payment, re-read-from-Stripe, refund, re-notify, manual delivery updates, account
  linking, and the full event timeline
- **Products** — create/edit/delete, image upload to Supabase Storage (cached one year), stock and
  featured toggles, specs/selling points/box contents editors
- **Categories**, **Discounts**, **Customers**, **Subscribers**, **Messages**, **Testimonials**
- **Site Settings** — homepage hero, announcement ticker, contact details, social links
- **System** — live status of every connected service (Supabase, Stripe, Resend, Storage, cron,
  storefront), the sending configuration, and an on-demand cron sweep

## Local development

```bash
# Terminal 1 — service stubs (Supabase/Stripe/Resend, in-memory)
node scripts/dev-stubs/stubs.mjs

# Terminal 2 — backend on :4000
cd backend && npm install && cp .env.example .env   # point at stubs or real services
npm run dev

# Terminal 3 — frontend on :3000
cd frontend && npm install && cp .env.example .env.local
npm run dev
```

To point the backend at the stubs, set `SUPABASE_URL=http://localhost:4600`,
`STRIPE_API_BASE=http://localhost:4601`, and `RESEND_API_BASE=http://localhost:4603`.

The stubs exercise the whole flow without live credentials — sign-in, checkout, the session pull
that replaces webhooks, refunds, the cron sweep, and the admin panel. Captured emails are listed at
<http://localhost:4603/sent>. Stub logins: `admin@gocartgrip.shop` / `admin-pass-123` (admin) and
`rider@example.com` / `rider-pass-123`.

## Production deployment

### 1. Supabase (database + auth + storage)

1. Create a project at [supabase.com](https://supabase.com).
2. SQL editor → run, in order: `supabase/migrations/001_init.sql`,
   `supabase/migrations/002_admin_payments.sql`, `supabase/migrations/003_manual_approval.sql`,
   `supabase/seed.sql`.
3. Auth → Providers: keep **Email** enabled, disable every other provider.
4. Collect from Settings → API: Project URL, `anon` key, `service_role` key.
5. After you sign up your admin account on the deployed site, run `supabase/make-admin.sql`
   (with your email) to unlock `/admin`.

### 2. Resend (email)

1. Create an API key at [resend.com](https://resend.com) and verify **gocartgrip.shop** as a
   sending domain (SPF/DKIM records on the domain).
2. `EMAIL_FROM` must use the verified domain: `Go Cart Grip <orders@gocartgrip.shop>`.
3. `EMAIL_REPLY_TO` (support@), `ADMIN_EMAIL` (admin@), and `SUPPORT_EMAIL` (support@) should all be
   real inboxes on the domain — the storefront advertises orders@, support@, sales@, warranty@,
   privacy@, and admin@.

### 3. Stripe

1. Copy the live secret key (`sk_live_…`) into `STRIPE_SECRET_KEY`. That is the whole setup.
2. **Do not create a webhook endpoint.** Payments are confirmed manually in `/admin/orders`; the
   backend reads Checkout Sessions directly from the Stripe API.
3. Confirm the account is live and charges are enabled on `/admin/system`.

### 4. Backend on Render

1. New → Blueprint, point at this repo — `render.yaml` provisions `gocartgrip-api` from `backend/`.
2. Fill in the secrets (`backend/.env.example` has the full annotated list): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `CRON_SECRET`. The rest are
   pre-set in the blueprint.
3. Verify `GET /health` returns
   `{"ok":true,"supabase":true,"email":true,"stripe":true,"cron":true,"stripeWebhooks":false}`.

### 5. Storefront on Cloudflare Workers

```bash
cd frontend
npm ci
npm run deploy          # builds with OpenNext and deploys to production
```

- Add `gocartgrip.shop` and `www.gocartgrip.shop` as custom domains (already declared in
  `frontend/wrangler.jsonc`).
- `NEXT_PUBLIC_*` values are inlined at build time — set them in CI (see below) or a local
  `.env.production`.
- There is no preview environment: every deploy is production.

### 6. Delivery cron Worker

```bash
cd workers/cron
npm install
npx wrangler secret put CRON_SECRET   # must match the backend's CRON_SECRET
npm run deploy
```

Set `vars.API_URL` in `workers/cron/wrangler.jsonc` to the Render URL. Visiting the Worker's URL
runs the sweep immediately, which is the quickest way to verify the secret.

### 7. Continuous deployment

`.github/workflows/deploy.yml` deploys the storefront and the cron Worker to production on every
push to the default branch. Repository secrets required:

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

`.github/workflows/ci.yml` typechecks and builds both apps on pull requests.
`scripts/deploy-production.sh` does the same deploy from a terminal.

## Product images

Product imagery uploaded through `/admin/products` goes to Supabase Storage under a timestamped
filename, which makes every image URL immutable — so it is stored with
`cache-control: max-age=31536000` (one year) and cached at Cloudflare's edge. Bundled artwork under
`/images` gets the same treatment via `next.config.ts` and `frontend/public/_headers`.
`images.unoptimized` is on because workerd has no `sharp`; upload images at the size you want them
served.

## API surface

| Method | Path                                | Auth  | Description                                       |
| ------ | ----------------------------------- | ----- | ------------------------------------------------- |
| GET    | `/health`                           | —     | Liveness + integration status                     |
| GET    | `/api/products[?category,featured]` | —     | Catalog                                           |
| GET    | `/api/products/:slug`               | —     | Product detail                                    |
| GET    | `/api/categories` / `/api/testimonials` / `/api/settings` | — | Storefront content    |
| POST   | `/api/discounts/validate`           | —     | `{code}` → `{percentOff}`                         |
| POST   | `/api/newsletter` / `/api/contact`  | —     | Subscribe / contact the garage                    |
| GET    | `/api/payments/config`              | —     | Stripe availability + delivery window             |
| POST   | `/api/orders`                       | opt.  | Create order + Stripe Checkout redirect           |
| GET    | `/api/orders/:id`                   | —     | Tracking view (safe subset, uuid-keyed)           |
| POST   | `/api/orders/:id/sync`              | —     | Pull the Checkout Session from Stripe             |
| POST   | `/api/orders/claim`                 | user  | Attach guest orders to the signed-in account      |
| GET    | `/api/account/orders[/:id]`         | user  | The customer's own orders + timeline              |
| POST   | `/api/cron/delivery-updates`        | cron  | Day 7/12/20 sweep (`CRON_SECRET`)                 |
| *      | `/api/admin/**`                     | admin | Stats, orders (confirm/refund/notify/link), paid orders, system status, products, uploads, categories, discounts, customers, subscribers, messages, testimonials, settings |

RLS: catalog and settings tables are publicly readable; signed-in users read only their own profile,
orders, order items, and order events (matched by user id **or** email); everything else is written
exclusively by the backend's service role.

## Editing seed content

`data/catalog.json` and `data/site-settings.json` are the canonical seed sources. After editing,
regenerate the SQL with `node scripts/generate-seed.mjs`, then re-run `supabase/seed.sql`. Once
live, day-to-day content changes belong in the admin panel, not the seed. Product imagery ships as
generated placeholder SVGs (`frontend/scripts/generate-images.mjs`) — replace via product image
uploads in `/admin/products`.
