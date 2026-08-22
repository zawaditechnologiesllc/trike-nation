import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { requireDb } from "../supabase";
import { runDeliveryUpdates } from "../orders/service";

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

/** Liveness probe for the scheduler itself. */
cronRouter.get("/ping", (_req, res) => {
  res.json({ ok: true, milestones: env.deliveryUpdateDays, at: new Date().toISOString() });
});
