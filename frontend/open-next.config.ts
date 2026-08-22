import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config — builds the Next.js app into a Cloudflare Worker
 * (`.open-next/worker.js`) with static assets served by Workers Assets.
 *
 * Incremental cache is left at the default (no KV binding) because every
 * storefront page revalidates against the API on a short timer and product
 * imagery is cached at the edge for a year by its own headers. Add
 * `incrementalCache: r2IncrementalCache` here plus an R2 binding in
 * wrangler.jsonc if you later want ISR to survive across isolates.
 */
export default defineCloudflareConfig();
