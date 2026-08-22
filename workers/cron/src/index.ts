/**
 * Go Cart Grip delivery-update scheduler.
 *
 * The storefront runs on Cloudflare Workers, so the schedule lives here too:
 * once a day this Worker calls the backend, which emails every in-flight order
 * its day 7 / 12 / 20 progress update. Keeping the schedule out of the web
 * service means a sleeping Render instance still gets swept.
 *
 * Deploy:  npx wrangler deploy --config workers/cron/wrangler.jsonc
 * Secret:  npx wrangler secret put CRON_SECRET --config workers/cron/wrangler.jsonc
 *          (must match CRON_SECRET on the backend)
 * Test:    curl https://gocartgrip-cron.<subdomain>.workers.dev  → runs it now
 */

interface Env {
  API_URL: string;
  CRON_SECRET: string;
}

interface SweepResult {
  ok?: boolean;
  checked?: number;
  sent?: { orderId: string; day: number; ok: boolean }[];
  skipped?: number;
  error?: string;
}

async function runSweep(env: Env): Promise<{ status: number; body: SweepResult }> {
  if (!env.CRON_SECRET) {
    return { status: 500, body: { error: "CRON_SECRET is not set on this Worker" } };
  }
  const url = `${env.API_URL.replace(/\/$/, "")}/api/cron/delivery-updates`;

  // Render free instances cold-start; retry a slow first call before giving up.
  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET}`,
          "Content-Type": "application/json",
          "User-Agent": "gocartgrip-cron/1.0",
        },
        body: "{}",
      });
      const body = (await res.json().catch(() => ({}))) as SweepResult;
      if (res.ok) return { status: res.status, body };
      lastError = `HTTP ${res.status}: ${body.error ?? "unknown error"}`;
      // Auth failures will not fix themselves — stop retrying.
      if (res.status === 401 || res.status === 403) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "fetch failed";
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  return { status: 502, body: { error: lastError } };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSweep(env).then(({ status, body }) => {
        if (status >= 400) {
          console.error("[cron] delivery sweep failed", body.error);
        } else {
          console.log(
            `[cron] delivery sweep ok — checked ${body.checked ?? 0}, sent ${body.sent?.length ?? 0}`,
          );
        }
      }),
    );
  },

  /** Manual trigger, handy for verifying the secret and the API URL. */
  async fetch(_request: Request, env: Env): Promise<Response> {
    const { status, body } = await runSweep(env);
    return new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
};
