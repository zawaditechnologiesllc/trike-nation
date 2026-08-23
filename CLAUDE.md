# Go Cart Grip — repository guide

E-commerce store for mini trikes, drift karts, mini bikes, and quads, on **gocartgrip.shop**.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything in the order flow.

## Layout

| Path            | What it is                              | Deploys to         |
| --------------- | ---------------------------------------- | ------------------ |
| `frontend/`     | Next.js 16 storefront + `/admin` panel   | Cloudflare Workers |
| `backend/`      | Express + TypeScript REST API            | Render             |
| `workers/cron/` | Scheduled Worker for delivery updates    | Cloudflare Workers |
| `supabase/`     | Migrations + seed                        | Supabase           |
| `data/`         | Canonical seed sources (catalog, settings)| —                 |
| `scripts/`      | Seed generator, dev stubs, deploy script | —                  |

## Things that will bite you

**There are no Stripe webhooks, on purpose.** Payment state is pulled with
`retrieveCheckoutSession`, never pushed. Nothing in the codebase may mark an order `paid`
automatically — only an admin action does, through `POST /api/admin/orders/:id/confirm-payment`.
Do not add a webhook route, a `STRIPE_WEBHOOK_SECRET`, or auto-approval "for convenience".

**All order state changes go through `setOrderStatus`** in `backend/src/orders/service.ts`. It
writes the row, records an `order_events` entry, and emails the customer as one unit. Never update
`orders.status` directly — a change that skips it silently stops notifying customers.

**supabase-js only types a `select()` written as a single string literal.** Concatenating the
column list collapses the result type to `GenericStringError` and the file stops compiling. The
long single-line `ORDER_COLUMNS` / `ORDER_LIST_FIELDS` / `ORDER_FIELDS` constants are that way
deliberately — do not "tidy" them into concatenations.

**Next is pinned to 16.2.12.** The `@opennextjs/cloudflare` peer range excludes 16.2.10; downgrading
breaks the Worker build.

**Product images are immutable.** Uploads get a timestamped filename and a one-year cache header, so
replacing an image means uploading a new file, never overwriting.

## Commands

```bash
# Local: stubs, then API, then storefront (three terminals)
node scripts/dev-stubs/stubs.mjs      # :4600 supabase :4601 stripe :4603 resend
cd backend  && npm run dev            # :4000
cd frontend && npm run dev            # :3000

# Checks — run both before pushing
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit && npm run build

# Deploy (production; there is no preview environment)
./scripts/deploy-production.sh
```

`scripts/dev-stubs/stubs.mjs` reimplements the subset of Supabase, Stripe, and Resend the API uses,
in memory, so the whole flow runs without credentials. Captured emails: <http://localhost:4603/sent>.
Stub logins: `admin@gocartgrip.shop` / `admin-pass-123`, `rider@example.com` / `rider-pass-123`.
Adding a new PostgREST filter or Stripe call to the backend usually means teaching the stub about
it too.

## Conventions

- Brand strings come from `frontend/src/lib/brand.ts` (frontend) and `env.ts` (backend). Do not
  hard-code the name, domain, or an email address in a page.
- Amounts are integer cents everywhere, priced server-side from the products table. Client totals
  are never trusted.
- Seed content is edited in `data/*.json`, then `node scripts/generate-seed.mjs` regenerates
  `supabase/seed.sql`. Do not hand-edit the SQL.
- Migrations are additive and numbered; add a new file rather than editing an applied one.
- Comments explain *why*, not what. Match the density of the file you are in.

## Documentation

| Doc | For |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, order lifecycle, data model, security |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)     | First-time setup and routine deploys |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)   | Every environment variable |
| [OPERATIONS.md](docs/OPERATIONS.md)     | Running the store day to day |
| [EMAILS.md](docs/EMAILS.md)             | Every email, its trigger, and its template |
