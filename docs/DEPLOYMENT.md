# Deployment runbook

Everything needed to take Go Cart Grip from an empty account set to a live store on
**gocartgrip.shop**, in the order it has to happen, with every command written out.

Work top to bottom the first time. After that, [Routine deploys](#10-routine-deploys) is the only
section you need.

| Step | Service            | Produces                                          |
| ---- | ------------------ | ------------------------------------------------- |
| 0    | your machine       | the code, running locally against stubs           |
| 1    | Supabase           | database, auth, storage bucket, keys              |
| 2    | Resend             | verified sending domain + API key                 |
| 3    | Stripe             | live secret key (no webhook)                      |
| 4    | Render             | the API, and its public URL                       |
| 5    | Cloudflare Workers | the storefront on the domain                      |
| 6    | Cloudflare Workers | the delivery cron                                 |
| 7    | GitHub Actions     | pushes deploy to production automatically         |
| 8    | —                  | the first admin account                           |
| 9    | —                  | the catalogue                                     |

Every variable named below is documented in [ENVIRONMENT.md](./ENVIRONMENT.md). Read
[ARCHITECTURE.md](./ARCHITECTURE.md) before changing anything in the order flow.

---

## 0. Prerequisites and local development

### Accounts

Supabase, Resend, Stripe, Render, Cloudflare, GitHub. All have a free tier that runs this store;
the notes below say where a paid plan actually changes behaviour.

You also need the domain **gocartgrip.shop** with its nameservers pointed at Cloudflare — the
storefront is served from a Cloudflare Worker on a custom domain, and Resend needs DNS records on
the same domain.

### Tools

```bash
node --version     # 20 or newer (the backend declares engines.node >= 20)
npm --version      # ships with Node
git --version
```

Wrangler is not installed globally — every command below invokes it with `npx` from the directory
whose `wrangler.jsonc` it should read.

### Get the code and install

```bash
git clone https://github.com/zawaditechnologiesllc/trike-nation.git
cd trike-nation

cd frontend      && npm ci && cd ..
cd backend       && npm install && cd ..
cd workers/cron  && npm install && cd ../..
```

### Run it locally against stubs

Three terminals. `scripts/dev-stubs/stubs.mjs` reimplements the parts of Supabase, Stripe and
Resend the API uses — in memory, **including the constraints that matter** (`order_events` NOT NULL
and UNIQUE, and the order-number trigger). A stub laxer than production is where a whole class of
bug hides.

```bash
# Terminal 1 — stubs: :4600 Supabase  :4601 Stripe  :4603 Resend
node scripts/dev-stubs/stubs.mjs

# Terminal 2 — API on :4000
cd backend
cp .env.example .env
npm run dev

# Terminal 3 — storefront on :3000
cd frontend
cp .env.example .env.local
npm run dev
```

Both `.env.example` files describe **production**, so point them at the stubs before the first run.
In `backend/.env`:

```bash
SUPABASE_URL=http://localhost:4600
SUPABASE_SERVICE_ROLE_KEY=stub-service-role
STRIPE_SECRET_KEY=sk_test_stub
STRIPE_API_BASE=http://localhost:4601
RESEND_API_KEY=re_stub
RESEND_API_BASE=http://localhost:4603
CRON_SECRET=stub-cron-secret
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=*
```

and in `frontend/.env.local`, `NEXT_PUBLIC_API_URL=http://localhost:4000`.

`STRIPE_API_BASE` and `RESEND_API_BASE` are **stub overrides only** — never set either in
production.

Captured emails: <http://localhost:4603/sent>.
Stub logins: `admin@gocartgrip.shop` / `admin-pass-123`, `rider@example.com` / `rider-pass-123`.

### Checks — run all four before pushing

```bash
cd frontend      && npm test && npx tsc --noEmit && npm run build
cd ../backend    && npx tsc --noEmit
cd ../workers/cron && npx tsc --noEmit
```

---

## 1. Supabase

### 1.1 Create the project

1. Create a project at [supabase.com](https://supabase.com).
2. Pick the region closest to your customers. Put the Render service (step 4) in the same region if
   you can — every API request makes several database round trips.
3. Save the database password somewhere safe. It is shown once.

### 1.2 Run the migrations

SQL editor → new query → paste and run each file **in this order**:

```
supabase/migrations/001_init.sql
supabase/migrations/002_admin_payments.sql
supabase/migrations/003_manual_approval.sql
supabase/migrations/004_storefront_complete.sql
supabase/migrations/005_product_dimensions.sql
supabase/seed.sql
```

What each one is for:

| File  | Adds                                                                                     |
| ----- | ---------------------------------------------------------------------------------------- |
| `001` | products, categories, orders, order items, profiles, and the RLS policies                  |
| `002` | admin payment fields, the audit columns, the `product-images` bucket and its policies      |
| `003` | order events, the payment audit trail, the guest-order trigger, RLS that matches orders by email |
| `004` | human order numbers, fulfilment stages, product colours and status, announcements, articles, wishlists, advisory origin fields — and the `UNIQUE (order_id, stage)` constraint the whole clock depends on |
| `005` | product `width` and `length`, printed on the spec PDF                                      |

Skipping any of them leaves the API writing to columns that do not exist.

**Every migration is safe to run twice.** If you are unsure which have been applied, re-running the
whole set is the correct thing to do.

The SQL editor is the documented path because it is the one that cannot surprise you. If you
prefer the CLI, note that these files use a `001…005` prefix rather than the CLI's
`<timestamp>_name.sql` convention — keep any new migration in the same numbering scheme, or a
timestamped file will sort ahead of all of them:

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push --dry-run    # read this before running it for real
npx supabase db push
```

### 1.3 Auth

1. Authentication → Providers: keep **Email** enabled and disable every other provider.
2. Decide whether to require email confirmation. If you do, a guest who accepts an account
   invitation has to confirm before their order appears under `/account`.
3. Authentication → URL Configuration:
   - Site URL: `https://gocartgrip.shop`
   - Redirect URLs: add `https://gocartgrip.shop/**` and, for local work,
     `http://localhost:3000/**`.

### 1.4 Storage

Migration `002` creates the public `product-images` bucket and its policies (and `003` re-asserts
them), so there is nothing to click. Confirm under Storage that the bucket exists and is **public** — product
images are served straight from it.

Uploads get a timestamped filename and a one-year cache header, so **replacing an image means
uploading a new file, never overwriting**.

### 1.5 Copy the keys

Settings → API. You need three values:

| Value               | Goes to                                                        |
| ------------------- | -------------------------------------------------------------- |
| Project URL         | `SUPABASE_URL` (Render) and `NEXT_PUBLIC_SUPABASE_URL` (build)  |
| `anon` key          | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build)                         |
| `service_role` key  | `SUPABASE_SERVICE_ROLE_KEY` (Render only)                       |

> The `service_role` key bypasses RLS. It belongs only in Render's environment. Never put it in the
> frontend, in a `NEXT_PUBLIC_*` variable, or in this repository.

**Verify:** Table editor shows `orders`, `order_events`, `products` (with `width` and `length`
columns), `system_state`, and a public `product-images` bucket.

---

## 2. Resend

1. Create an account at [resend.com](https://resend.com) and add **gocartgrip.shop** as a domain.
2. Publish the DNS records Resend gives you — SPF, DKIM, and the return-path CNAME — in Cloudflare
   DNS. Set those records to **DNS only** (grey cloud), not proxied.
3. Wait for the domain status to go **verified**. Sends fail until it does.
4. API Keys → create a key with **send** permission → this is `RESEND_API_KEY`.
5. Make sure these inboxes exist and are monitored. The storefront advertises them and customers
   reply to them:

   | Address                   | Used for                                                    |
   | ------------------------- | ----------------------------------------------------------- |
   | `orders@gocartgrip.shop`  | `EMAIL_FROM` — every customer email is sent from here        |
   | `support@gocartgrip.shop` | `EMAIL_REPLY_TO` and `SUPPORT_EMAIL` — replies land here     |
   | `admin@gocartgrip.shop`   | `ADMIN_EMAIL` — new-order alerts and contact-form messages   |
   | `sales@`, `warranty@`, `privacy@` | published on the storefront for customers            |

**Verify:** after step 4, `/admin/system` reports Resend **operational** with the domain listed.
Every email, its trigger and its template are in [EMAILS.md](./EMAILS.md).

---

## 3. Stripe

1. Complete Stripe's account activation so charges are enabled.
2. Developers → API keys → copy the **live secret key** (`sk_live_…`) → `STRIPE_SECRET_KEY`.
3. That is the entire integration. **Do not create a webhook endpoint.** Payments are confirmed by
   hand in the admin panel and the API reads Checkout Sessions directly with
   `retrieveCheckoutSession`. See
   [ARCHITECTURE.md](./ARCHITECTURE.md#why-there-are-no-stripe-webhooks).
4. Optional: set `STRIPE_CURRENCY` if you are not selling in USD.

Nothing in this system may mark an order `paid` automatically — only
`POST /api/admin/orders/:id/confirm-payment`, triggered by an admin, does that.

**Verify:** `/admin/system` shows Stripe **operational**, "Live mode · charges enabled".

---

## 4. API on Render

### 4.1 Create the service

1. Render dashboard → New → **Blueprint**, and point it at this repository.
   `render.yaml` provisions a web service named `gocartgrip-api` from `backend/`, with a health
   check on `/health`.
2. Render fills in everything except five secrets marked `sync: false`. Set those in the dashboard:

   | Variable                    | Value                                    |
   | --------------------------- | ---------------------------------------- |
   | `SUPABASE_URL`              | from step 1.5                            |
   | `SUPABASE_SERVICE_ROLE_KEY` | from step 1.5                            |
   | `RESEND_API_KEY`            | from step 2.4                            |
   | `STRIPE_SECRET_KEY`         | from step 3.2                            |
   | `CRON_SECRET`               | generate it now, keep it — step 6 needs the same value |

   ```bash
   openssl rand -hex 32     # CRON_SECRET
   ```

3. Deploy, then note the service URL: `https://gocartgrip-api.onrender.com`.

Everything else — `EMAIL_FROM`, `ADMIN_EMAIL`, `BRAND_NAME`, `DELIVERY_UPDATE_DAYS`,
`FRONTEND_URL`, `CORS_ORIGIN` and the rest — is pre-set in `render.yaml`. Change those there, in
the repository, rather than by hand in the dashboard, so the next blueprint sync does not undo you.

### 4.2 Verify

```bash
curl https://gocartgrip-api.onrender.com/health
# {"ok":true,"brand":"Go Cart Grip","supabase":true,"email":true,
#  "stripe":true,"cron":true,"stripeWebhooks":false}
```

Any `false` means that integration's variables are missing. `"stripeWebhooks":false` is correct and
permanent.

> On Render's free plan the instance sleeps when idle. The cron Worker retries a cold start three
> times, so the sweep still lands, but a paid instance makes checkout noticeably faster.

---

## 5. Storefront on Cloudflare Workers

### 5.1 Authenticate

```bash
cd frontend
npx wrangler login          # or export CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npx wrangler whoami
```

### 5.2 Build-time environment

**`NEXT_PUBLIC_*` is inlined into the bundle at BUILD time.** A value set only as a runtime Worker
variable is an empty string in the browser and the feature dies silently. So these must be present
wherever the build runs — CI (step 7) or your shell.

For a manual deploy, write them to `frontend/.env.production` (git-ignored):

```bash
cd frontend
cat > .env.production <<'EOF'
NEXT_PUBLIC_API_URL=https://gocartgrip-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
NEXT_PUBLIC_SITE_URL=https://gocartgrip.shop
EOF
```

Replace `YOUR-PROJECT-REF` and `YOUR-ANON-KEY` with the values from step 1.5 — they are specific to
your Supabase project and cannot be filled in ahead of time.

### 5.3 Deploy

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run deploy       # opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

`npm run deploy` builds with the OpenNext adapter and deploys **straight to production** — there is
no preview environment. To inspect the bundle first without shipping it:

```bash
npm run cf:preview   # builds and serves the Worker locally
```

### 5.4 Custom domains, one time only

1. Cloudflare dashboard → Workers & Pages → **gocartgrip** → Settings → Domains & Routes.
2. Add `gocartgrip.shop` and `www.gocartgrip.shop` as custom domains. Both are already declared in
   `frontend/wrangler.jsonc`, and Cloudflare creates the DNS records and the certificate.
3. Back on Render, confirm `FRONTEND_URL` and `CORS_ORIGIN` match the live domain. They are pre-set
   to `https://gocartgrip.shop` in `render.yaml` — change them only if the domain changes.

**Verify:** `https://gocartgrip.shop` loads with products, and the browser console shows no CORS
errors against `/api/products`.

---

## 6. Delivery cron Worker

The Worker calls `POST /api/cron/tick` on the API, which runs both clocks: the 7/12/20-day delivery
updates and the abandoned-cart recovery.

```bash
cd workers/cron
npm install

# The API URL lives in vars.API_URL in wrangler.jsonc. It is already set to
# https://gocartgrip-api.onrender.com — edit it there if yours differs.

npx wrangler secret put CRON_SECRET    # the SAME value you set on Render
npx tsc --noEmit
npm run deploy
```

**Verify:** open the Worker's `*.workers.dev` URL. Visiting it runs the sweep immediately and
returns the result, so a `200` with `{"ok":true,…}` proves both the URL and the secret. A `401`
means the two `CRON_SECRET` values do not match.

```bash
npx wrangler tail       # live logs, if you need to watch a sweep
```

Then check `/admin/system` → "Delivery update cron" shows the last sweep time.

The schedule is `*/15 * * * *` in `workers/cron/wrangler.jsonc`. Every sweep claims an
`order_events` row before acting, so overlapping runs cannot double-send, and `dueStage` returns
the **last** due stage — a long outage produces one email per order, not a burst of four.

---

## 7. GitHub Actions

**Pushing to the repository's default branch deploys to production.**
`.github/workflows/deploy.yml` builds and deploys the storefront Worker and the cron Worker on
every push touching `frontend/**` or `workers/**`, and can be run by hand from the Actions tab
(`workflow_dispatch`). The API redeploys itself from `render.yaml` on the same push.

Settings → Secrets and variables → Actions → New repository secret, seven times:

| Secret                          | Used by      | Where it comes from                                      |
| ------------------------------- | ------------ | -------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | deploy       | Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID`         | deploy       | Cloudflare dashboard sidebar                             |
| `NEXT_PUBLIC_API_URL`           | deploy       | the Render service URL                                   |
| `NEXT_PUBLIC_SUPABASE_URL`      | deploy       | Supabase → Settings → API                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | deploy       | Supabase → Settings → API                                |
| `CRON_SECRET`                   | backup clock | the same value as on Render                              |
| `API_URL`                       | backup clock | the Render service URL                                   |

The deploy workflow runs a preflight step that fails with the names of any missing secrets rather
than half-deploying.

The other two workflows:

- `.github/workflows/ci.yml` — typechecks and builds both apps on pull requests.
- `.github/workflows/cron-backup.yml` — ticks the clock hourly as a backup for the Cloudflare
  Worker. A scheduler with no backup fails silently, and the first sign is a customer asking where
  their order is.

---

## 8. The first admin

1. Sign up on the live site at `https://gocartgrip.shop/signup`.
2. Supabase → SQL editor → run `supabase/make-admin.sql`, with the address you signed up with in
   place of the one in the file:

   ```sql
   update public.profiles set is_admin = true where email = 'admin@gocartgrip.shop';
   select id, email, is_admin from public.profiles where is_admin;
   ```

   0 rows updated means that address has not signed up yet — do step 1 first.

3. Reload `https://gocartgrip.shop/admin`.

Every later admin is promoted the same way.

---

## 9. Load the catalogue

Three ways in, in increasing order of effort.

### 9.1 The seed

`supabase/seed.sql` (run in step 1.2) ships the starting catalogue. Edit the source, never the SQL:

```bash
# Edit data/catalog.json and data/site-settings.json, then:
node scripts/generate-seed.mjs        # regenerates supabase/seed.sql
node frontend/scripts/generate-images.mjs   # regenerates the SVG artwork
```

### 9.2 Bulk import from a product sheet

`/admin/import` takes a plain-text sheet. Fields can be in any order, headings work with or without
colons, and colours can be written any of the three usual ways. **Preview first** — it reports
exactly what would happen and saves nothing.

```
Name: "Viper" Special Edition TGV Mini Trike
Price: $1,100.00
Was: $1,200
Category: mini-trikes
Engine: 200cc
Length: 60 in
Width: 34 in
Badge: SALE
Tagline: Custom Build • Worldwide Ship
Description: The Viper Special Edition is engineered for the adrenaline seeker.
Colors: Viper Red #b31d28, Midnight Black #101010
In the box:
- Fully Assembled Viper
- 2x Replacement Sleeves
Specs:
- Top Speed: 45 MPH
- Frame: Reinforced TIG-Welded Steel

------------------------

Product: 212cc Monster Minibike
Price: 650
Category: mini-bikes
Engine: 212CC
Dimensions: 52 x 29 in
Details: Raw power in a compact frame.
- Available in Red, Black and Blue
```

Notes on the fields that catch people out:

- **`Length` and `Width`** are printed on the product spec PDF, at the top of the specifications
  table. Write the unit — `Length: 60 in`, not `Length: 60` — because the value is stored and
  printed exactly as typed. A single `Dimensions: 60 x 34 in` line works too and is read as
  **length by width**; the preview tells you which way round it read them, so check it before
  importing. Explicit `Length:` and `Width:` lines always win over a combined line.
- **`Price`** understands `$1,299.00`, `1299` and `£1.299,00`. A product with no readable price is
  rejected rather than imported at zero.
- **Products are separated** by a line of dashes, or simply by the next `Name:`.
- **Colours** are part of the cart line identity — the same product in two colours is two lines.
- Re-importing a slug **updates** it, but never overwrites a colour list an admin edited by hand.

### 9.3 One at a time

`/admin/products` → New product, including the image upload. Images are immutable: replacing one
means uploading a new file.

---

## 10. Routine deploys

Push to the repository's default branch — currently
**`claude/nextjs-project-setup-7o6tb5`**. That is the whole procedure.

```bash
git push origin claude/nextjs-project-setup-7o6tb5
```

`deploy.yml` also listens on `main`, so renaming the default branch to `main` later keeps
deploying without an edit to the workflow.

To deploy from a terminal instead:

```bash
./scripts/deploy-production.sh              # storefront + cron
./scripts/deploy-production.sh storefront   # just the site
./scripts/deploy-production.sh cron         # just the scheduler
```

The script runs `npm ci`, typechecks, and deploys. The backend is not in it — Render redeploys
itself from `render.yaml` on the same push.

**A database change ships separately and first.** Migrations are additive, numbered, and safe to
run twice; add a new numbered file and run it in the Supabase SQL editor **before** the code that
depends on it reaches production.

---

## 11. Smoke test after a deploy

Ten minutes, once, on the live site:

1. `curl https://gocartgrip-api.onrender.com/health` → every integration `true`.
2. `/admin/system` → everything **operational**.
3. Place a real order with a real card for the cheapest item, using an email address that has **no**
   account.
4. On return, the success page says "Payment received" and the order shows
   `awaiting_confirmation` — **not** `paid`.
5. Check the `orders@` inbox: "We've got your order — GCG-2026-…". Check `admin@`: "Order awaiting
   confirmation".
6. `/admin/orders?status=needs_action` → the order is there; Stripe reports `paid` with a matching
   amount.
7. Confirm the payment. Two emails arrive: "Payment confirmed" and "Create your account". Both name
   the same order number as the receipt.
8. Follow the account link, sign up, and check the order is listed under `/account`.
9. Move the order to shipped with a tracking number → the tracking email arrives.
10. Open a product's spec PDF (`/api/products/<slug>/spec.pdf`) → the price, colours and the
    length/width rows are right.
11. Refund the order from its admin page → Stripe shows the refund and "Refund issued" arrives.

If any step fails, [OPERATIONS.md](./OPERATIONS.md#troubleshooting) has the likely cause.

---

## 12. Rolling back

- **Storefront / cron** — Cloudflare → Workers & Pages → the Worker → Deployments → roll back to
  the previous version. Instant, no rebuild.
- **API** — Render → the service → Events → redeploy a previous commit.
- **Database** — migrations are additive and there is no down-migration. Restore from a Supabase
  backup if one genuinely has to be undone.

## 13. Backups

- **Database** — Supabase takes daily backups on paid plans. On the free plan, take your own before
  anything risky:

  ```bash
  npx supabase link --project-ref YOUR-PROJECT-REF
  npx supabase db dump --linked -f backup-$(date +%F).sql              # schema
  npx supabase db dump --linked --data-only -f backup-$(date +%F)-data.sql
  ```

- **Product images** — the `product-images` bucket is the only copy of what admins upload. Download
  it periodically from the Storage page.
- **Secrets** — `CRON_SECRET` exists in two places that must match (Render and the cron Worker) and
  one that should (the `cron-backup` GitHub secret). Record where each lives; there is no way to
  read a Worker secret back.
