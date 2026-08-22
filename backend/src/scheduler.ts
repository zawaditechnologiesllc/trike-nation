import { env } from "./env";
import { supabase } from "./supabase";
import { runDeliveryUpdates } from "./orders/service";

/**
 * In-process fallback scheduler. The production schedule is owned by the
 * Cloudflare cron Worker (workers/cron) hitting POST /api/cron/delivery-updates,
 * which keeps the job outside the web dyno. Set ENABLE_INTERNAL_CRON=true when
 * you want a single-instance deployment (or local dev) to sweep on its own.
 *
 * Never enable it on more than one instance — the sweep is idempotent per
 * milestone, but two instances racing will still duplicate work.
 */

const HOUR_MS = 60 * 60 * 1000;

export function startInternalScheduler(): void {
  if (!env.internalCron) return;
  if (!supabase) {
    console.warn("[cron] internal scheduler requested but Supabase is not configured — not starting");
    return;
  }

  const tick = () => {
    runDeliveryUpdates().catch((err) => console.error("[cron] internal sweep failed", err));
  };

  // First sweep a minute after boot so deploys don't stampede the mail API.
  setTimeout(tick, 60_000).unref?.();
  const timer = setInterval(tick, 6 * HOUR_MS);
  timer.unref?.();
  console.log("[cron] internal scheduler on — delivery sweep every 6h");
}
