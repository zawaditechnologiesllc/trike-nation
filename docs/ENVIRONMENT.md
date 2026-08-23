# Environment variables

Every variable the three deployables read, where it is set, and what breaks without it.

- [API (Render)](#api-render)
- [Storefront (Cloudflare Workers)](#storefront-cloudflare-workers)
- [Delivery cron Worker](#delivery-cron-worker)
- [GitHub Actions secrets](#github-actions-secrets)
- [Local development](#local-development)

Annotated templates live in [`backend/.env.example`](../backend/.env.example) and
[`frontend/.env.example`](../frontend/.env.example).

## API (Render)

Set in the Render dashboard, or pre-set in [`render.yaml`](../render.yaml). The five marked
**secret** are the only ones you have to type in yourself.

### Required

| Variable                    | Example                                | Notes                                                    |
| --------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `SUPABASE_URL`              | `https://abc.supabase.co`              | **secret-ish.** Without it every data endpoint returns 503 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…`                                 | **secret.** Bypasses RLS — API only, never the frontend  |
| `RESEND_API_KEY`            | `re_…`                                 | **secret.** Missing → no customer email is ever sent      |
| `STRIPE_SECRET_KEY`         | `sk_live_…`                            | **secret.** Missing → checkout returns 503                |
| `CRON_SECRET`               | 32+ random chars                       | **secret.** Must match the cron Worker's secret exactly   |

### Branding and URLs

| Variable       | Default                    | Notes                                                              |
| -------------- | -------------------------- | ------------------------------------------------------------------ |
| `FRONTEND_URL` | `https://gocartgrip.shop`  | Stripe redirects, order links in emails, the account-invite link    |
| `CORS_ORIGIN`  | `https://gocartgrip.shop,https://www.gocartgrip.shop` | Comma-separated. `*` allows everything |
| `BRAND_NAME`   | `Go Cart Grip`             | Email headers and footers, the admin System page                    |
| `BRAND_DOMAIN` | `gocartgrip.shop`          | Default for the address variables below                             |
| `PORT`         | `4000`                     | Render injects this automatically                                   |
| `NODE_ENV`     | `development`              | Shown on the System page                                            |

### Email addresses

| Variable         | Default                    | Notes                                                        |
| ---------------- | -------------------------- | ------------------------------------------------------------ |
| `EMAIL_FROM`     | `Go Cart Grip <orders@gocartgrip.shop>` | Must be on the domain verified in Resend        |
| `EMAIL_REPLY_TO` | `support@gocartgrip.shop`  | Where customer replies land                                   |
| `ADMIN_EMAIL`    | `admin@gocartgrip.shop`    | New-order alerts and contact-form messages                    |
| `SUPPORT_EMAIL`  | `support@gocartgrip.shop`  | Printed in every email footer                                 |

### Payments

| Variable                  | Default | Notes                                                          |
| ------------------------- | ------- | -------------------------------------------------------------- |
| `STRIPE_CURRENCY`         | `usd`   | Three-letter ISO code                                           |
| `STRIPE_PUBLISHABLE_KEY`  | unset   | Optional; only needed if you later render Stripe Elements       |
| `STRIPE_API_BASE`         | unset   | **Test/stub override only.** Never set in production            |

There is deliberately **no `STRIPE_WEBHOOK_SECRET`** — see
[ARCHITECTURE.md](./ARCHITECTURE.md#why-there-are-no-stripe-webhooks).

### Delivery and cron

| Variable               | Default   | Notes                                                             |
| ---------------------- | --------- | ----------------------------------------------------------------- |
| `DELIVERY_UPDATE_DAYS` | `7,12,20` | Days after confirmed payment that trigger a progress email          |
| `DELIVERY_MIN_DAYS`    | `12`      | Advertised delivery window, low end (before transit allowance)      |
| `DELIVERY_MAX_DAYS`    | `30`      | Advertised delivery window, high end                                |
| `RETURN_DAYS`          | `30`      | Return window quoted in the policy pages                            |
| `REFUND_DAYS`          | `7`       | Hand-processing SLA quoted in the refund email                      |
| `NO_REPLY_EMAIL`       | `no-reply@<domain>` | Sender for notices that take no reply                     |
| `ENABLE_INTERNAL_CRON` | `false`   | Sweep from inside the API process instead of the Worker. **Single instance only** — two instances will duplicate work |

### Other

| Variable              | Default    | Notes                                                        |
| --------------------- | ---------- | ------------------------------------------------------------ |
| `IMAGE_CACHE_SECONDS` | `31536000` | `cache-control` on product image uploads. One year            |
| `RESEND_API_BASE`     | `https://api.resend.com` | **Test/stub override only**                     |

## Storefront (Cloudflare Workers)

`NEXT_PUBLIC_*` values are **inlined into the bundle at build time**, not read at runtime. Setting
them in `wrangler.jsonc` vars after the fact does nothing — they have to be present wherever
`npm run deploy` runs, which in practice means GitHub Actions secrets or a local
`.env.production`.

| Variable                        | Example                             | Notes                                              |
| ------------------------------- | ----------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | `https://gocartgrip-api.onrender.com` | No trailing slash. Missing → the storefront renders empty states |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://abc.supabase.co`           | Auth only                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…`                              | Anon key. **Never** the service-role key            |
| `NEXT_PUBLIC_SITE_URL`          | `https://gocartgrip.shop`           | Canonical URL for metadata and Open Graph tags      |
| `MAPS_API_KEY`                  | —                                   | **Server-side only.** Optional; enables address autocomplete through `/api/address-suggest`. Without it the street field is a plain input |
| `TURNSTILE_SECRET_KEY`          | —                                   | Optional bot protection on public forms             |

Because the first four are inlined at build time, there is a runtime fallback
chain for them — `serverEnv()` → `window.__APP_ENV` → `/api/public-env` — so a
value supplied only as a Worker variable still reaches the browser. See
`frontend/src/lib/env.ts`.

## Delivery cron Worker

Set in [`workers/cron/wrangler.jsonc`](../workers/cron/wrangler.jsonc), except the secret.

| Variable      | Kind   | Notes                                                                    |
| ------------- | ------ | ------------------------------------------------------------------------ |
| `API_URL`     | var    | The Render URL, no trailing slash                                         |
| `CRON_SECRET` | secret | `npx wrangler secret put CRON_SECRET`. Must match the API's value exactly |

A mismatch shows up as a `401` when you open the Worker's URL.

## GitHub Actions secrets

Settings → Secrets and variables → Actions.

| Secret                          | Used by | Where it comes from                                  |
| ------------------------------- | ------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | deploy  | Cloudflare → My Profile → API Tokens → "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID`         | deploy  | Cloudflare dashboard sidebar                         |
| `NEXT_PUBLIC_API_URL`           | deploy  | the Render service URL                               |
| `NEXT_PUBLIC_SUPABASE_URL`      | deploy  | Supabase → Settings → API                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | deploy  | Supabase → Settings → API                            |
| `CRON_SECRET`                   | backup clock | the same value as on Render                     |
| `API_URL`                       | backup clock | the Render service URL                          |

The last two are for `.github/workflows/cron-backup.yml`, which ticks the clock
hourly in case the Cloudflare Worker is down.

## Local development

Point the API at the in-memory stubs instead of live services:

```bash
# backend/.env
SUPABASE_URL=http://localhost:4600
SUPABASE_SERVICE_ROLE_KEY=stub-service-role
STRIPE_API_BASE=http://localhost:4601
STRIPE_SECRET_KEY=sk_test_stub
RESEND_API_BASE=http://localhost:4603
RESEND_API_KEY=re_stub
CRON_SECRET=stub-cron-secret
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=*
PORT=4000
```

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=http://localhost:4600
NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`EMAIL_FROM` contains spaces and angle brackets — quote it if your shell sources the file directly.

## Rotating a secret

1. Create the new value in the provider's dashboard.
2. Update it on Render (and on the cron Worker too, for `CRON_SECRET` — rotate both together or the
   sweep starts returning 401).
3. Render restarts the service automatically; confirm on `/health` and `/admin/system`.
4. Revoke the old value at the provider.

Rotating `NEXT_PUBLIC_*` values requires a **rebuild**, not just a restart, because they are baked
into the bundle.
