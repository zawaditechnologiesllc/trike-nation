# Go Cart Grip — repository guide

Direct-to-consumer store for mini trikes, drift karts, mini bikes and quads, on
**gocartgrip.shop**. Sells worldwide, direct, no dealers.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything in the order flow.

## Layout

| Path            | What it is                                 | Deploys to         |
| --------------- | ------------------------------------------ | ------------------ |
| `frontend/`     | Next.js 16 storefront + `/admin` panel     | Cloudflare Workers |
| `backend/`      | Express + TypeScript REST API              | Render             |
| `frontend/src/shared/core/` | Dependency-free modules read by both + tests | —      |
| `workers/cron/` | Scheduled Worker driving the clock         | Cloudflare Workers |
| `supabase/`     | Migrations + seed                          | Supabase           |
| `data/`         | Canonical seed sources                     | —                  |
| `scripts/`      | Seed generator, dev stubs, deploy script   | —                  |

## Things that will bite you

**There are no Stripe webhooks, on purpose.** Payment state is pulled with
`retrieveCheckoutSession`, never pushed. Nothing may mark an order `paid` automatically — only an
admin action does, through `POST /api/admin/orders/:id/confirm-payment`. Do not add a webhook
route, a `STRIPE_WEBHOOK_SECRET`, or auto-approval "for convenience".

**Idempotency lives in the database, not in application logic.** Every "did we already do this?"
is answered by `UNIQUE (order_id, stage)` on `order_events`. Claiming a step IS the insert; error
`23505` means another run claimed it. Never `SELECT` then `INSERT` — that race fires exactly when
two cron runs overlap, and the symptom is a customer emailed twice.

**All order state changes go through `setOrderStatus`** (`backend/src/orders/service.ts`) or a
`claimStage` in `backend/src/orders/events.ts`. Both write the row, record the timeline entry, and
email the customer as one unit. Never update `orders.status` directly.

**`NEXT_PUBLIC_*` is inlined at BUILD time on Workers.** A value set only as a runtime Worker
variable is an empty string in the browser and the feature dies silently. Use `serverEnv()` on the
server, `clientEnv()`/`ensureClientEnv()` in the browser — see `frontend/src/lib/env.ts`.

**`frontend/src/shared/core` is the one definition of each fact.** Delivery windows, the stage
schedule, colours, couriers, validation, price bands, risk scoring, the PDF writer.

It lives inside the app on purpose. Turbopack will not resolve modules outside the app root —
not by tsconfig path, not by alias, not through a symlink — and forcing it with `turbopack.root`
moves the standalone output somewhere the OpenNext adapter cannot find, which breaks the deploy
and not the build. The frontend imports `@/shared/core/…`; the backend reaches in relatively.
Do not "tidy" this back out to the repository root.

**supabase-js only types a `select()` written as a single string literal.** Concatenating the
column list collapses the result type and the file stops compiling. The long single-line
`ORDER_COLUMNS` / `ORDER_LIST_FIELDS` / `ORDER_FIELDS` constants are that way deliberately.

**Next is pinned to 16.2.12.** The `@opennextjs/cloudflare` peer range excludes 16.2.10.

**Product images are immutable.** Uploads get a timestamped filename and a one-year cache header,
so replacing an image means uploading a new file, never overwriting.

**Never build `aggregateRating` or `Review` markup.** Reviews that do not exist are the commonest
cause of a structured-data manual action, and the penalty falls on the whole domain. A test
asserts their absence — do not "fix" it.

## Commands

```bash
# Local: stubs, then API, then storefront (three terminals)
node scripts/dev-stubs/stubs.mjs      # :4600 supabase :4601 stripe :4603 resend
cd backend  && npm run dev            # :4000
cd frontend && npm run dev            # :3000

# Checks — run all three before pushing
cd frontend && npm test && npx tsc --noEmit && npm run build
cd backend  && npx tsc --noEmit
cd workers/cron && npx tsc --noEmit

# Deploy (production; there is no preview environment)
./scripts/deploy-production.sh
```

`scripts/dev-stubs/stubs.mjs` reimplements the subset of Supabase, Stripe and Resend the API uses,
in memory, **including the constraints that matter** — `order_events` NOT NULL and UNIQUE. A stub
laxer than production is where a whole class of bug hides. Adding a new PostgREST filter or Stripe
call usually means teaching the stub about it too. Captured emails: <http://localhost:4603/sent>.
Stub logins: `admin@gocartgrip.shop` / `admin-pass-123`, `rider@example.com` / `rider-pass-123`.

## Conventions

- **Comment the WHY, and name the cost.** `// Read fresh: money math must never be stale.`
- **Tests describe consequences.** `test("STOPS the moment the buyer has bought anything")`, not
  `test("shouldRemind returns false")`. Mutation-check the important ones: reintroduce the bug and
  confirm the test goes red. A test that cannot fail is decoration.
- **Fail safe.** A failed email never rolls back an order. An unreachable API never takes down the
  sitemap. An unknown country is served, not refused.
- **One definition per fact**, including lists — two modules with their own copy of the same
  vocabulary is the same bug with a longer fuse.
- Brand strings come from `frontend/src/lib/brand.ts` and `backend/src/env.ts`. Never hard-code the
  name, domain, or an email address in a page.
- Amounts are integer cents, priced server-side. Client totals are never trusted.
- Colours are part of the cart **line identity**: the same product in two colours is two lines.
- Seed content is edited in `data/*.json`, then `node scripts/generate-seed.mjs`. Do not hand-edit
  the SQL. Regenerate the SVG artwork with `frontend/scripts/generate-images.mjs` — a rebrand has
  to include it.
- Migrations are additive, numbered, and **every one is safe to run twice**.

## Documentation

| Doc | For |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, order lifecycle, data model, security |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)     | First-time setup and routine deploys |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)   | Every environment variable |
| [OPERATIONS.md](docs/OPERATIONS.md)     | Running the store day to day |
| [EMAILS.md](docs/EMAILS.md)             | Every email, its trigger, and its template |
