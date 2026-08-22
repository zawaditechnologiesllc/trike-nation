#!/usr/bin/env bash
# Deploys Go Cart Grip to production: the storefront Worker and the delivery
# cron Worker. There is no staging environment — this goes live.
#
#   ./scripts/deploy-production.sh            # both
#   ./scripts/deploy-production.sh storefront # just the site
#   ./scripts/deploy-production.sh cron       # just the scheduler
#
# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (or an interactive
# `wrangler login`), plus frontend/.env.production with the NEXT_PUBLIC_* values
# — Next inlines those at build time.
set -euo pipefail

target="${1:-all}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy_storefront() {
  echo "==> Storefront → Cloudflare Workers"
  cd "$root/frontend"
  npm ci
  npx tsc --noEmit
  npm run deploy
}

deploy_cron() {
  echo "==> Delivery cron → Cloudflare Workers"
  cd "$root/workers/cron"
  npm install
  npx tsc --noEmit
  npx wrangler deploy
}

case "$target" in
  storefront) deploy_storefront ;;
  cron)       deploy_cron ;;
  all)        deploy_storefront; deploy_cron ;;
  *)          echo "usage: $0 [all|storefront|cron]" >&2; exit 1 ;;
esac

echo "==> Done. Backend deploys itself from render.yaml on push."
