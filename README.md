# Trike Nation

E-commerce storefront for handcrafted mini trikes, drift karts, mini bikes, and quads —
implemented from the Stitch "Trike Nation Site Redesign" mockups (Apex Rugged design system:
dark "Stealth & Fire" palette, Anton display type, Manrope body, JetBrains Mono technical labels).

## Architecture

| Piece    | Tech                                    | Runs on  | Directory    |
| -------- | --------------------------------------- | -------- | ------------ |
| Frontend | Next.js 16 (App Router) + Tailwind CSS 4 | Vercel   | `frontend/`  |
| Backend  | Express + TypeScript REST API            | Render   | `backend/`   |
| DB/Auth  | Supabase (Postgres + email/password auth) | Supabase | `supabase/`  |

The storefront is fully browsable in **demo mode** with zero configuration: the catalog is
bundled, orders are simulated, and auth UI explains how to enable itself. Adding the env vars
below progressively lights up the real backend, database, and accounts.

### Pages

Home, Shop (category/price/engine filters), Product detail (specs, box contents, reviews,
related), Cart, Checkout (discount codes, guest or signed-in), Order confirmation,
Login/Signup (Supabase email+password), Account (profile + order history), About, FAQ,
Contact, Support, Shipping, Warranty, Privacy, Terms.

The active discount code is **BIKEMIKE26** (10% off), as in the mockups. Product imagery is
generated placeholder SVGs (`frontend/scripts/generate-images.mjs`) — swap files in
`frontend/public/images/` for real photography.

## Local development

```bash
# Frontend (http://localhost:3000)
cd frontend
npm install
cp .env.example .env.local   # optional — works without it in demo mode
npm run dev

# Backend (http://localhost:4000)
cd backend
npm install
cp .env.example .env         # optional — works without it in demo mode
npm run dev
```

## Deployment

### 1. Supabase (database + auth)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/migrations/001_init.sql`, then `supabase/seed.sql`.
3. Auth → Providers: keep **Email** enabled; disable all other providers
   (email/password only). Optionally disable "Confirm email" for instant signups.
4. Note the values in Settings → API: Project URL, `anon` key, `service_role` key.

### 2. Backend on Render

1. New → Blueprint, point at this repo — `render.yaml` provisions the
   `trike-nation-api` web service from `backend/`.
   (Or create a Node web service manually: root `backend`, build
   `npm install && npm run build`, start `npm start`, health check `/health`.)
2. Set environment variables:
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key (secret!)
   - `CORS_ORIGIN` — your Vercel URL(s), comma-separated
3. Verify `https://<service>.onrender.com/health` returns `{"ok":true,"supabase":true}`.

### 3. Frontend on Vercel

1. Import the repo in Vercel and set **Root Directory** to `frontend`
   (framework auto-detects as Next.js).
2. Set environment variables:
   - `NEXT_PUBLIC_API_URL` — the Render URL, e.g. `https://trike-nation-api.onrender.com`
   - `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` key
3. Deploy. Then tighten `CORS_ORIGIN` on Render to the deployed Vercel URL.

## API

| Method | Path                      | Description                                     |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/health`                 | Liveness + Supabase connection state            |
| GET    | `/api/products`           | List products (`?category=`, `?featured=true`)  |
| GET    | `/api/products/:slug`     | Product detail                                  |
| GET    | `/api/categories`         | Categories                                      |
| GET    | `/api/testimonials`       | Testimonials                                    |
| POST   | `/api/discounts/validate` | `{code}` → `{percentOff}`                       |
| POST   | `/api/newsletter`         | `{email}` → subscribe                           |
| POST   | `/api/orders`             | Place order; prices computed server-side. Optional `Authorization: Bearer <supabase JWT>` links the order to the account |

Orders are inserted with the service-role key; RLS lets signed-in users read only their own
orders and profile, while the catalog tables are publicly readable.

## Keeping data in sync

`frontend/src/lib/catalog.ts` is the canonical catalog. After editing it:

```bash
node --experimental-strip-types -e "import('./frontend/src/lib/catalog.ts').then(m => require('node:fs').writeFileSync('backend/src/catalog.json', JSON.stringify({categories: m.CATEGORIES, products: m.PRODUCTS, testimonials: m.TESTIMONIALS, discountCodes: m.DISCOUNT_CODES}, null, 2)))"
node scripts/generate-seed.mjs   # regenerates supabase/seed.sql
```
