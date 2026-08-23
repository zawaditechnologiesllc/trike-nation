# Deployment runbook

Everything needed to take Go Cart Grip from an empty account set to a live store on
**gocartgrip.shop**, in the order it has to happen.

Work top to bottom the first time. After that, [Routine deploys](#8-routine-deploys) is the only
section you need.

| Step | Service            | Produces                                     |
| ---- | ------------------ | -------------------------------------------- |
| 1    | Supabase           | database, auth, storage bucket               |
| 2    | Resend             | verified sending domain + API key            |
| 3    | Stripe             | live secret key (no webhook)                 |
| 4    | Render             | the API, and its public URL                  |
| 5    | Cloudflare Workers | the storefront on the domain                 |
| 6    | Cloudflare Workers | the delivery cron                            |
| 7    | —                  | the first admin account                      |
| 8    | GitHub Actions     | pushes deploy to production automatically    |

Every variable named below is documented in [ENVIRONMENT.md](./ENVIRONMENT.md).

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick the region closest to your
   customers; the API on Render should be in the same region if possible.
2. SQL editor → run these **in order**:
   ```
   supabase/migrations/001_init.sql
   supabase/migrations/002_admin_payments.sql
   supabase/migrations/003_manual_approval.sql
   supabase/seed.sql
   ```
   `003` is the one this store depends on: order events, the payment audit trail, the delivery
   milestones, the guest-order trigger, and the RLS policies that match orders by email. Skipping
   it leaves the API writing to columns that do not exist.
3. Auth → Providers: keep **Email** enabled and disable every other provider. Decide whether to
   require email confirmation — if you do, a guest who accepts an account invitation has to confirm
   before their order appears.
4. Auth → URL Configuration: set the Site URL to `https://gocartgrip.shop`.
5. Settings → API: copy the **Project URL**, the **anon** key, and the **service_role** key.

> The `service_role` key bypasses RLS. It belongs only in Render's environment. Never put it in the
> frontend, a `NEXT_PUBLIC_*` variable, or this repository.

Verify: Table editor shows `orders`, `order_events`, `system_state`, and a public
`product-images` storage bucket.

## 2. Resend

1. Create an account at [resend.com](https://resend.com) and add **gocartgrip.shop** as a domain.
2. Publish the DNS records Resend gives you (SPF, DKIM, and the return-path CNAME) on the domain,
   then wait for the status to go **verified**. Sends fail until it does.
3. Create an API key with send permission → `RESEND_API_KEY`.
4. Make sure these inboxes exist and are monitored — the storefront advertises them and customers
   reply to them:

   | Address                  | Used for                                              |
   | ------------------------ | ----------------------------------------------------- |
   | `orders@gocartgrip.shop` | `EMAIL_FROM` — every customer email is sent from here  |
   | `support@gocartgrip.shop`| `EMAIL_REPLY_TO` and `SUPPORT_EMAIL` — replies land here |
   | `admin@gocartgrip.shop`  | `ADMIN_EMAIL` — new-order alerts and contact-form messages |
   | `sales@`, `warranty@`, `privacy@` | published on the storefront for customers    |

Verify: after step 4, `/admin/system` reports Resend **operational** with the domain listed.

## 3. Stripe

1. Complete Stripe's account activation so charges are enabled.
2. Copy the **live secret key** (`sk_live_…`) → `STRIPE_SECRET_KEY`.
3. That is the entire integration. **Do not create a webhook endpoint** — payments are confirmed by
   hand in the admin panel and the API reads Checkout Sessions directly. See
   [ARCHITECTURE.md](./ARCHITECTURE.md#why-there-are-no-stripe-webhooks).
4. Optional: set `STRIPE_CURRENCY` if you are not selling in USD.

Verify: `/admin/system` shows Stripe **operational**, "Live mode · charges enabled".

## 4. API on Render

1. New → **Blueprint**, point it at this repository. `render.yaml` provisions `gocartgrip-api`
   from `backend/` with a health check on `/health`.
2. Fill in the five secrets marked `sync: false`:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`,
   `CRON_SECRET`. Everything else is pre-set in the blueprint.
   Generate the cron secret with something like `openssl rand -hex 32` and keep it — step 6 needs
   the same value.
3. Deploy, then note the service URL (`https://gocartgrip-api.onrender.com`).

Verify:
```bash
curl https://gocartgrip-api.onrender.com/health
# {"ok":true,"brand":"Go Cart Grip","supabase":true,"email":true,
#  "stripe":true,"cron":true,"stripeWebhooks":false}
```
Any `false` means that integration's variables are missing.

> On Render's free plan the instance sleeps when idle. The cron Worker retries a cold start three
> times, so the daily sweep still lands, but a paid instance makes checkout noticeably faster.

## 5. Storefront on Cloudflare Workers

The `NEXT_PUBLIC_*` values are inlined into the bundle at **build** time, so they must be set
wherever the build runs — CI (step 8) or your shell.

```bash
cd frontend
npm ci

NEXT_PUBLIC_API_URL=https://gocartgrip-api.onrender.com \
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY \
NEXT_PUBLIC_SITE_URL=https://gocartgrip.shop \
npm run deploy
```

`npm run deploy` builds with OpenNext and deploys straight to production — there is no preview
environment.

Then, one time only:

1. Cloudflare dashboard → Workers & Pages → `gocartgrip` → Settings → Domains & Routes. Add
   `gocartgrip.shop` and `www.gocartgrip.shop` as custom domains (both are already declared in
   `frontend/wrangler.jsonc`; Cloudflare creates the DNS records).
2. Back on Render, confirm `FRONTEND_URL` and `CORS_ORIGIN` match the live domain. They are
   pre-set to `https://gocartgrip.shop` in `render.yaml` — change them only if the domain changes.

Verify: `https://gocartgrip.shop` loads with products, and the browser console shows no CORS
errors on `/api/products`.

## 6. Delivery cron Worker

```bash
cd workers/cron
npm install

# Point it at the API first — edit vars.API_URL in wrangler.jsonc if the
# Render URL differs from the default.

npx wrangler secret put CRON_SECRET    # the SAME value as on Render
npm run deploy
```

Verify: open the Worker's `*.workers.dev` URL. Visiting it runs the sweep immediately and returns
the result, so a `200` with `{"ok":true,...}` proves both the URL and the secret. A `401` means the
two `CRON_SECRET` values do not match.

Then check `/admin/system` → "Delivery update cron" shows the last sweep time.

The schedule is `0 14 * * *` (14:00 UTC, 07:00 PT) in `workers/cron/wrangler.jsonc`.

## 7. The first admin

1. Sign up on the live site at `https://gocartgrip.shop/signup`.
2. Supabase → SQL editor → run `supabase/make-admin.sql` with your email in place of the
   placeholder.
3. Reload `https://gocartgrip.shop/admin`.

Every later admin can be promoted the same way.

## 8. Routine deploys

**Pushing to the repository's default branch deploys to production.**
`.github/workflows/deploy.yml` builds and deploys the storefront Worker and the cron Worker on
every push that touches `frontend/**` or `workers/**`, and can also be run by hand from the Actions
tab (`workflow_dispatch`). The API redeploys itself from `render.yaml` on the same push.

Repository secrets the workflow needs (Settings → Secrets and variables → Actions):

| Secret                          | Where it comes from                          |
| ------------------------------- | -------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | Cloudflare → My Profile → API Tokens, "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID`         | Cloudflare dashboard sidebar                 |
| `NEXT_PUBLIC_API_URL`           | the Render service URL                       |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Settings → API                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API                    |

`.github/workflows/ci.yml` typechecks and builds both apps on pull requests.

To deploy from a terminal instead:

```bash
./scripts/deploy-production.sh              # storefront + cron
./scripts/deploy-production.sh storefront   # just the site
./scripts/deploy-production.sh cron         # just the scheduler
```

## Smoke test after a deploy

Ten minutes, once, on the live site:

1. `curl https://gocartgrip-api.onrender.com/health` → every integration `true`.
2. `/admin/system` → everything **operational**.
3. Place a real order with a real card for the cheapest item, using an email address that has **no**
   account.
4. On return, the success page says "Payment received" and the order shows
   `awaiting_confirmation`.
5. Check the `orders@` inbox: "We've got your order". Check `admin@`: "Order awaiting confirmation".
6. `/admin/orders?status=needs_action` → the order is there; Stripe reports `paid` with a matching
   amount.
7. Confirm the payment. Two emails arrive: "Payment confirmed" and "Create your account".
8. Follow the account link, sign up, and check the order is listed under `/account`.
9. Move the order to shipped with a tracking number → the tracking email arrives.
10. Refund it from the order page → Stripe shows the refund and "Refund issued" arrives.

If any step fails, [OPERATIONS.md](./OPERATIONS.md#troubleshooting) has the likely cause.

## Rolling back

- **Storefront / cron** — Cloudflare → Workers & Pages → the Worker → Deployments → roll back to
  the previous version. Instant, no rebuild.
- **API** — Render → the service → Events → redeploy a previous commit.
- **Database** — migrations are additive and safe to re-run; there is no down-migration. Restore
  from a Supabase backup if a migration has to be undone.
