# Trike Nation

Production e-commerce platform for handcrafted mini trikes, drift karts, mini bikes, and quads —
implemented from the Stitch "Trike Nation Site Redesign" mockups (Apex Rugged design system:
dark "Stealth & Fire" palette, Anton display type, Manrope body, JetBrains Mono technical labels).

## Architecture

| Piece    | Tech                                                      | Runs on  | Directory   |
| -------- | ---------------------------------------------------------- | -------- | ----------- |
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4                    | Vercel   | `frontend/` |
| Backend  | Express + TypeScript REST API                               | Render   | `backend/`  |
| DB/Auth  | Supabase — Postgres, email/password auth, Storage           | Supabase | `supabase/` |
| Email    | Resend (order confirmations, shipping, contact, newsletter) | —        | —           |
| Payments | Stripe hosted Checkout + PayPal Business (Orders v2)        | —        | —           |

All storefront data is served by the backend from Supabase — there is no synthetic fallback
data. If the API is unreachable the storefront renders graceful empty/error states.

### Storefront

Home (hero + announcement ticker are admin-editable), Shop with category/price/engine filters,
Product detail (specs, box contents, reviews, related), Cart, Checkout (Stripe or PayPal,
discount codes, guest or signed-in), Order confirmation with live payment status,
Login/Signup (Supabase email+password only), Account with order history, and prefilled
About / FAQ / Contact (with form) / Support / Shipping / Warranty / Privacy / Terms pages.

### Admin panel — `/admin`

Access requires a signed-in user whose profile has `is_admin = true`
(`supabase/make-admin.sql`). Responsive sidebar layout with:

- **Dashboard** — revenue, order counts, fulfilment queue, recent orders
- **Orders** — filter by status; detail view with items, shipping address, payment ref;
  update status/tracking/notes (marking **shipped** emails the customer their tracking number)
- **Products** — create/edit/delete, image upload to Supabase Storage (or paste a URL),
  featured/stock toggles, specs/selling points/box contents editors
- **Categories** — names, taglines, badges shown on the storefront
- **Discounts** — create/enable/disable/delete percentage codes (seeded: `BIKEMIKE26`, 10%)
- **Customers** — registered users with order counts and lifetime spend
- **Subscribers** — newsletter list with CSV export
- **Messages** — contact-form inbox (unread badges, reply-by-email)
- **Testimonials** — manage the quotes shown on the storefront
- **Site Settings** — edit the homepage hero (kicker/title/accent/subtitle/buttons with live
  preview), announcement ticker, all contact details, and social links

### Order lifecycle

```
checkout → POST /api/orders (server-side pricing + discount validation)
        → order row (pending_payment) + Stripe Checkout Session or PayPal order
        → customer pays on the provider's hosted page
        → Stripe: signed webhook /api/webhooks/stripe   → order paid → Resend receipt
          PayPal: /checkout/paypal/return → server-side capture → order paid → Resend receipt
        → admin fulfils: processing → shipped (tracking email) → delivered
          (or cancelled / refunded)
```

Amounts are always computed server-side from the database; client totals are never trusted.
The webhook route verifies Stripe signatures against the raw body; PayPal captures verify the
order's `custom_id` matches before marking paid.

## Local development

```bash
# Terminal 1 — service stubs (Supabase/Stripe/PayPal/Resend, in-memory)
node scripts/dev-stubs/stubs.mjs

# Terminal 2 — backend on :4000
cd backend && npm install && cp .env.example .env   # point at stubs or real services
npm run dev

# Terminal 3 — frontend on :3000
cd frontend && npm install && cp .env.example .env.local
npm run dev
```

The stubs (`scripts/dev-stubs/stubs.mjs`) let you exercise the entire flow — sign-in, checkout,
webhooks, emails, the admin panel — without any live credentials. Stub logins:
`admin@trike-nation.com` / `admin-pass-123` (admin) and `rider@example.com` / `rider-pass-123`.

## Production deployment

### 1. Supabase (database + auth + storage)

1. Create a project at [supabase.com](https://supabase.com).
2. SQL editor → run, in order: `supabase/migrations/001_init.sql`,
   `supabase/migrations/002_admin_payments.sql`, `supabase/seed.sql`.
3. Auth → Providers: keep **Email** enabled, disable every other provider
   (email/password only). Configure "Confirm email" to taste.
4. Collect from Settings → API: Project URL, `anon` key, `service_role` key.
5. After you sign up your admin account on the deployed site, run
   `supabase/make-admin.sql` (with your email) to unlock `/admin`.

### 2. Resend (email)

1. Create an API key at [resend.com](https://resend.com) and verify your sending domain.
2. `EMAIL_FROM` must use the verified domain (e.g. `Trike Nation <orders@trike-nation.com>`).
3. `ADMIN_EMAIL` receives contact-form notifications.

### 3. Stripe

1. Grab the live secret key (`sk_live_…`) from the Stripe dashboard.
2. After the backend is deployed, add a webhook endpoint:
   `https://<render-service>.onrender.com/api/webhooks/stripe` with events
   `checkout.session.completed` and `checkout.session.expired`; copy its signing
   secret into `STRIPE_WEBHOOK_SECRET`.

### 4. PayPal Business

1. In the [PayPal developer dashboard](https://developer.paypal.com), create a REST app
   under your Business account (Live).
2. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_ENV=live`
   (omit `PAYPAL_ENV` to use the sandbox while testing).

### 5. Backend on Render

1. New → Blueprint, point at this repo — `render.yaml` provisions `trike-nation-api`
   from `backend/`.
2. Fill in the env vars (see `backend/.env.example` for the full annotated list):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
   `ADMIN_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `FRONTEND_URL`, `CORS_ORIGIN`.
3. Verify `GET /health` returns
   `{"ok":true,"supabase":true,"email":true,"stripe":true,"paypal":true}`.

### 6. Frontend on Vercel

1. Import the repo, set **Root Directory** to `frontend` (auto-detected as Next.js).
2. Env vars: `NEXT_PUBLIC_API_URL` (Render URL), `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy, then set `FRONTEND_URL`/`CORS_ORIGIN` on Render to the final Vercel URL.

## API surface

| Method | Path                            | Auth   | Description                                        |
| ------ | ------------------------------- | ------ | -------------------------------------------------- |
| GET    | `/health`                       | —      | Liveness + integration status                      |
| GET    | `/api/products[?category,featured]` | —  | Catalog                                            |
| GET    | `/api/products/:slug`           | —      | Product detail                                     |
| GET    | `/api/categories` / `/api/testimonials` / `/api/settings` | — | Storefront content     |
| POST   | `/api/discounts/validate`       | —      | `{code}` → `{percentOff}`                          |
| POST   | `/api/newsletter`               | —      | Subscribe (+ welcome email)                        |
| POST   | `/api/contact`                  | —      | Store message + notify `ADMIN_EMAIL`               |
| GET    | `/api/payments/config`          | —      | Which providers are enabled                        |
| POST   | `/api/orders`                   | opt.   | Create order + payment redirect (JWT links order)  |
| GET    | `/api/orders/:id`               | —      | Confirmation-page status (uuid-keyed safe subset)  |
| POST   | `/api/payments/paypal/capture`  | —      | Capture after PayPal approval                      |
| POST   | `/api/webhooks/stripe`          | sig    | Signature-verified payment confirmation            |
| *      | `/api/admin/**`                 | admin  | Stats, orders, products, uploads, categories, discounts, customers, subscribers, messages, testimonials, settings |

RLS: catalog and settings tables are publicly readable; signed-in users read only their own
profile and orders; everything else is written exclusively by the backend's service role.

## Editing seed content

`data/catalog.json` and `data/site-settings.json` are the canonical seed sources. After
editing, regenerate the SQL with `node scripts/generate-seed.mjs`, then re-run
`supabase/seed.sql`. Once live, day-to-day content changes belong in the admin panel, not
the seed. Product imagery ships as generated placeholder SVGs
(`frontend/scripts/generate-images.mjs`) — replace via product image uploads in `/admin/products`.
