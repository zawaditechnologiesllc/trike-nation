# Go Cart Grip

Production e-commerce platform for handcrafted mini trikes, drift karts, mini bikes, and quads,
running on **[gocartgrip.shop](https://gocartgrip.shop)**. Apex Rugged design system: dark
"Stealth & Fire" palette, Anton display type, Manrope body, JetBrains Mono technical labels.

| Piece    | Tech                                                    | Runs on            | Directory       |
| -------- | ------------------------------------------------------- | ------------------ | --------------- |
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4, via OpenNext   | Cloudflare Workers | `frontend/`     |
| Backend  | Express + TypeScript REST API                            | Render             | `backend/`      |
| Shared   | Dependency-free modules read by both, and by the tests   | —                  | `frontend/src/shared/core/` |
| DB/Auth  | Supabase — Postgres, email/password auth, Storage        | Supabase           | `supabase/`     |
| Email    | Resend — every order event, delivery update, and invite  | —                  | —               |
| Payments | Stripe hosted Checkout — **no webhooks**                 | —                  | —               |
| Cron     | Scheduled Worker + CI backup → the stage clock           | Cloudflare Workers | `workers/cron/` |
| Tests    | `node --test` with `tsx`, no framework                   | —                  | `frontend/tests/` |

## Documentation

| Doc | For |
| --- | --- |
| **[Architecture](docs/ARCHITECTURE.md)** | How it fits together, the order lifecycle, the data model, the security model |
| **[Deployment](docs/DEPLOYMENT.md)**     | First-time setup, routine deploys, the smoke test, rollbacks |
| **[Environment](docs/ENVIRONMENT.md)**   | Every environment variable and where it is set |
| **[Operations](docs/OPERATIONS.md)**     | Confirming payments, fulfilling orders, refunds, troubleshooting |
| **[Emails](docs/EMAILS.md)**             | Every email, its trigger, and its template |
| **[CLAUDE.md](CLAUDE.md)**               | Repository conventions and the traps worth knowing |

## The one thing to understand

**Payments are confirmed by a person, not a webhook.**

```
checkout → POST /api/orders (server-side pricing + discount validation)
         → order row (pending_payment) + Stripe Checkout Session
         → customer pays on Stripe's hosted page
         → returns to /checkout/success?order=<id>&session_id=<cs_…>
         → POST /api/orders/:id/sync  ← the backend PULLS the session from Stripe
         → order becomes awaiting_confirmation, and an admin is emailed
         → admin reviews it in /admin/orders and clicks "Confirm Payment as Paid"
         → order becomes paid → customer emailed → order linked to their account
         → admin fulfils: processing → shipped (tracking) → delivered
           (or cancelled / refunded)
```

Stripe's webhook delivery is not used at all: no endpoint, no signing secret, nothing to misfire or
silently stop. The backend reads Checkout Sessions directly and records what Stripe reports —
status, amount, payment intent, receipt — for an admin to check before confirming. Amounts are
always recomputed server-side; client totals are never trusted. Full reasoning in
[Architecture](docs/ARCHITECTURE.md#why-there-are-no-stripe-webhooks).

Because delivery takes 12–30 days, confirming a payment also attaches the order to the buyer's
account — or emails them an invitation to create one, prefilled with the address they ordered with.

## Storefront

Home, Shop with filters **derived from the live catalogue** (price bands on round numbers with
counts, engine sizes, live category counts — never a filter that leads to an empty grid), Search,
Product detail with colour swatches and a downloadable spec PDF, Wishlist, a cart drawer plus the
full cart page, Checkout, order confirmation, public order tracking at `/orders/<id>`,
Login/Signup, Account with order history, and prefilled About / FAQ / Contact / Support / Shipping /
Warranty / Privacy / Terms / Cookies pages. An admin-authored announcement stripe, scheduled per
notice, runs across the top of every page.

Colour is part of the cart **line identity** — the same product in two colours is two lines, and it
reaches the order, every email and the PDF.

## Admin panel — `/admin`

Requires a signed-in user whose profile has `is_admin = true` (`supabase/make-admin.sql`).

- **Dashboard** — revenue, the payments-to-confirm queue, fulfilment counts, recent orders
- **Paid Orders** — confirmed payments only, with revenue totals by range and CSV export
- **All Orders** — status filter (including "needs action") and email search; detail view with
  confirm-payment, re-read-from-Stripe, refund, re-notify, manual delivery updates, account
  linking, and the full event timeline
- **Products** — create/edit/delete, image upload to Supabase Storage (cached one year)
- **Bulk Import** — paste a product sheet; preview says exactly what would happen and saves nothing
- **Announcements** — the notice stripe, scheduled per notice
- **Categories**, **Discounts**, **Customers**, **Subscribers**, **Messages**, **Testimonials**
- **Site Settings** — hero, ticker, contact details, social links, shipping, tax, logo
- **System** — live status of every connected service, the trust checklist, a logo probe, and an
  on-demand cron sweep

## Local development

```bash
# Terminal 1 — service stubs (Supabase/Stripe/Resend, in-memory)
node scripts/dev-stubs/stubs.mjs

# Terminal 2 — backend on :4000
cd backend && npm install && cp .env.example .env
npm run dev

# Terminal 3 — frontend on :3000
cd frontend && npm install && cp .env.example .env.local
npm run dev
```

Point the backend at the stubs with `SUPABASE_URL=http://localhost:4600`,
`STRIPE_API_BASE=http://localhost:4601`, `RESEND_API_BASE=http://localhost:4603` (full local config
in [Environment](docs/ENVIRONMENT.md#local-development)).

The stubs exercise the whole flow without live credentials — sign-in, checkout, the session pull
that replaces webhooks, refunds, the cron sweep, and the admin panel. Captured emails are listed at
<http://localhost:4603/sent>. Stub logins: `admin@gocartgrip.shop` / `admin-pass-123` (admin) and
`rider@example.com` / `rider-pass-123`.

## Deploying

Pushing to the repository's default branch deploys to production — the storefront Worker, the cron
Worker, and the API all redeploy. There is no preview environment. To deploy from a terminal:

```bash
./scripts/deploy-production.sh
```

Before pushing, run all three checks:

```bash
cd frontend && npm test && npx tsc --noEmit && npm run build
cd backend  && npx tsc --noEmit
cd workers/cron && npx tsc --noEmit
```

First-time setup, required secrets, and the post-deploy smoke test are in
[Deployment](docs/DEPLOYMENT.md).

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
| GET    | `/api/announcements`                | —     | Live, in-schedule notices                         |
| POST   | `/api/cron/tick`                    | cron  | Both sweeps (`CRON_SECRET`)                       |
| POST   | `/api/cron/delivery-updates` / `/abandoned` | cron | Either sweep on its own                   |
| *      | `/api/admin/**`                     | admin | Stats, orders (confirm/refund/notify/link), paid orders, system status, products, uploads, categories, discounts, customers, subscribers, messages, testimonials, settings |

RLS: catalog and settings tables are publicly readable; signed-in users read only their own profile,
orders, order items, and order events (matched by user id **or** email); everything else is written
exclusively by the backend's service role.

## Editing seed content

`data/catalog.json` and `data/site-settings.json` are the canonical seed sources. After editing,
regenerate with `node scripts/generate-seed.mjs`, then re-run `supabase/seed.sql`. Once live,
day-to-day content changes belong in the admin panel, not the seed.
