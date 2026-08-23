import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { requireDb } from "../supabase";
import { runAbandonedRecovery, runDeliveryUpdates } from "../orders/service";

/**
 * Scheduled jobs, called by the Cloudflare cron Worker (workers/cron) or any
 * scheduler that can send an HTTP request. Protected by CRON_SECRET, presented
 * either as `Authorization: Bearer <secret>` or `X-Cron-Secret: <secret>`.
 */
export const cronRouter = Router();

function presentedSecret(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-cron-secret"];
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return null;
}

function secretMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

cronRouter.use((req, res, next) => {
  if (!env.cronSecret) {
    res.status(503).json({ error: "CRON_SECRET is not configured" });
    return;
  }
  const presented = presentedSecret(req);
  if (!presented || !secretMatches(presented, env.cronSecret)) {
    res.status(401).json({ error: "Invalid cron credentials" });
    return;
  }
  next();
});

/** Day 7 / 12 / 20 progress emails for orders in flight. */
cronRouter.post("/delivery-updates", requireDb, async (_req, res) => {
  try {
    const result = await runDeliveryUpdates();
    res.json({ ok: true, ...result, milestones: env.deliveryUpdateDays });
  } catch (err) {
    console.error("[cron] delivery updates failed", err);
    res.status(500).json({ error: "Delivery update sweep failed" });
  }
});

/** Abandoned-order chases at day 3, 7 and 12. */
cronRouter.post("/abandoned", requireDb, async (_req, res) => {
  try {
    res.json({ ok: true, ...(await runAbandonedRecovery()) });
  } catch (err) {
    console.error("[cron] abandoned recovery failed", err);
    res.status(500).json({ error: "Abandoned recovery sweep failed" });
  }
});

/**
 * Everything the clock owns, in one call. This is what the scheduler hits;
 * the individual endpoints stay for targeted re-runs from the admin panel.
 *
 * One sweep failing must not stop the others — an order stuck mid-pipeline is
 * a worse outcome than a retry.
 */
cronRouter.post("/tick", requireDb, async (_req, res) => {
  const results: Record<string, unknown> = {};
  for (const [name, run] of [
    ["delivery", runDeliveryUpdates],
    ["abandoned", runAbandonedRecovery],
  ] as const) {
    try {
      results[name] = await run();
    } catch (err) {
      console.error(`[cron] ${name} sweep failed`, err);
      results[name] = { error: err instanceof Error ? err.message : "failed" };
    }
  }
  res.json({ ok: true, ...results });
});

/** Liveness probe for the scheduler itself. */
cronRouter.get("/ping", (_req, res) => {
  res.json({ ok: true, milestones: env.deliveryUpdateDays, at: new Date().toISOString() });
});
