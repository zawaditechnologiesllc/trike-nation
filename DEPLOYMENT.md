# Deploying Trike Nation to production

This repo deploys as **three pieces**. Deploy them in this order:

| # | Piece                          | Where    | Source directory |
| - | ------------------------------ | -------- | ---------------- |
| 1 | Database / Auth / Storage      | Supabase | `supabase/`      |
| 2 | REST API (Express)             | Render   | `backend/`       |
| 3 | Storefront + admin (Next.js)   | Vercel   | `frontend/`      |

Works identically from a fork — nothing in the code is tied to the original
GitHub account. See the [fork checklist](#deploying-from-a-fork) below.

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL editor → run, **in order**:
   `supabase/migrations/001_init.sql` → `supabase/migrations/002_admin_payments.sql` → `supabase/seed.sql`.
3. Auth → Providers: keep **Email** enabled, disable everything else.
4. Collect from **Settings → API**: Project URL, `anon` key, `service_role` key.
5. Later — after signing up your admin account on the live site — run
   `supabase/make-admin.sql` (edit in your email) to unlock `/admin`.

## 2. Backend on Render

1. Render → **New → Blueprint** → point at this repo (or your fork).
   `render.yaml` provisions the `trike-nation-api` service from `backend/`.
2. Set the env vars in the Render dashboard — `backend/.env.example` is the
   full annotated list. Minimum for the storefront to work:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `CORS_ORIGIN`.
   Payments/email additionally need the Stripe / PayPal / Resend keys
   (see README §Production deployment for the provider dashboards).
3. Verify: open `https://<your-service>.onrender.com/health` — you want
   `{"ok":true,"supabase":true,...}`. Each `false` names the integration whose
   env vars are missing.

## 3. Frontend on Vercel

1. Vercel → **Add New → Project** → import the repo (or your fork).
2. **⚠ Root Directory — this is the step everyone misses.**
   On the *Configure Project* screen (or later under *Settings → Build and
   Deployment*), set **Root Directory** to:

   ```
   frontend
   ```

   The Next.js app lives in `frontend/`, not the repo root. With the root
   directory set, Vercel auto-detects Next.js; leave build/install commands
   at their defaults. (If you skip this, the build fails on purpose with a
   message pointing you back here.)
3. Environment variables (Project → Settings → Environment Variables):

   | Variable                        | Value                                        |
   | ------------------------------- | -------------------------------------------- |
   | `NEXT_PUBLIC_API_URL`           | your Render URL, e.g. `https://trike-nation-api.onrender.com` — no trailing slash |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Settings → API → Project URL      |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` key       |

   `NEXT_PUBLIC_*` values are **baked in at build time** — after adding or
   changing them you must trigger a new deployment (Deployments → ⋯ → Redeploy).
4. Deploy, note your final URL (e.g. `https://trike-nation.vercel.app`), then
   go **back to Render** and set `FRONTEND_URL` and `CORS_ORIGIN` to exactly
   that URL (https, no trailing slash). Comma-separate `CORS_ORIGIN` to allow
   extra origins (custom domain, localhost).
5. In the Stripe dashboard, point the webhook at the **Render** URL:
   `https://<your-service>.onrender.com/api/webhooks/stripe`
   (events `checkout.session.completed`, `checkout.session.expired`) and copy
   the signing secret into `STRIPE_WEBHOOK_SECRET` on Render.

## Deploying from a fork

1. Import **your fork** in Vercel/Render — same steps as above.
2. Vercel builds your fork's **default branch** as Production. This repo's
   default branch is `claude/nextjs-project-setup-7o6tb5`; if your work lives
   on another branch, either change the fork's default branch on GitHub or set
   *Settings → Environments → Production* branch in Vercel. Pushes to other
   branches only create preview deployments.
3. Nothing in the code references the original repo — no code changes needed.
4. Remember the cross-links: `FRONTEND_URL`/`CORS_ORIGIN` on Render must match
   *your* Vercel domain, and the Stripe webhook must point at *your* Render URL.

## Vercel troubleshooting

| Symptom | Cause → fix |
| ------- | ----------- |
| Build fails: *"No Next.js version detected"*, *"Couldn't find any \`pages\` or \`app\` directory"*, or the explicit *"Misconfigured Vercel project"* message | Root Directory isn't set. Settings → Build and Deployment → **Root Directory = `frontend`** → Redeploy. |
| Build succeeds but the deployed site is blank / 404 | Framework preset ended up as "Other". Fix Root Directory (above); Next.js is then auto-detected. |
| Site loads but shop/home are empty; checkout says *"Store backend is not configured"* | `NEXT_PUBLIC_API_URL` is missing (or was added after the last build). Add it, then **Redeploy** — env changes never apply to existing builds. |
| Login/signup pages say auth isn't configured | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing → add + Redeploy. |
| Browser console shows CORS errors calling the API | On Render, set `CORS_ORIGIN` (and `FRONTEND_URL`) to your exact Vercel origin — `https://your-app.vercel.app`, no trailing slash, comma-separate multiples. |
| Storefront empty for ~1 min after idle, then fine | Render free tier spins the API down when idle; first request cold-starts it. Upgrade the Render plan to keep it warm. |
| Deploy built an old/unexpected branch | Vercel's Production branch = the fork's default branch. Change it under Settings → Environments → Production (see fork checklist). |
| Build fails on Node/engine errors | Next.js 16 needs Node ≥ 20.9. Project → Settings → Build and Deployment → Node.js version → 22.x (Vercel's default). |
| Paid orders stay `pending_payment` | Stripe webhook must target the **Render** URL (`/api/webhooks/stripe`), not the Vercel one, and `STRIPE_WEBHOOK_SECRET` must be that endpoint's signing secret. |
| Product images pasted in the admin don't render | Only `https://` image URLs are allowed (`frontend/next.config.ts`); `http://` URLs are rejected by `next/image`. |

## Post-deploy smoke test

1. `GET /health` on Render → everything `true`.
2. Home page shows seeded products (not empty states).
3. Sign up → run `supabase/make-admin.sql` → `/admin` loads.
4. Test checkout end-to-end (Stripe test mode or PayPal sandbox first:
   `sk_test_…` key and `PAYPAL_ENV` unset → sandbox).
5. Contact form → message appears in `/admin/messages` and `ADMIN_EMAIL` inbox.
