# Go Cart Grip — storefront

Next.js 16 (App Router) + Tailwind CSS 4, deployed to **Cloudflare Workers** via
the [OpenNext](https://opennext.js.org/cloudflare) adapter.

## Local development

```bash
npm install
cp .env.example .env.local   # point NEXT_PUBLIC_API_URL at the backend
npm run dev                  # http://localhost:3000
```

## Deploying

There is no preview environment — every deploy goes to production at
<https://gocartgrip.shop>.

```bash
npm run cf:preview   # build the Worker and run it locally in workerd
npm run deploy       # build + deploy to production
```

CI does the same thing on every push to the default branch
(`.github/workflows/deploy.yml`), so pushing is the normal way to ship.

### Environment variables

`NEXT_PUBLIC_*` values are inlined at build time, so they must be present when
the Worker is *built* — set them as repository secrets for CI, or in a local
`.env.production` file:

| Variable                        | Purpose                          |
| ------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_URL`           | Backend API base URL (no slash)  |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                |
| `NEXT_PUBLIC_SITE_URL`          | Canonical site URL for metadata  |

### Images

Product imagery is uploaded through `/admin/products` into Supabase Storage with
a one-year `cache-control`, and bundled artwork under `/images` is served with
`max-age=31536000, immutable` (see `next.config.ts` and `public/_headers`).
Because workerd has no `sharp`, `images.unoptimized` is on — images are served
exactly as stored and cached at Cloudflare's edge.
