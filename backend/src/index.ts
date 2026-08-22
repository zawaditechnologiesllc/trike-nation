import cors from "cors";
import express from "express";
import { env, integrationStatus, reportBootConfig } from "./env";
import { requireDb, supabase } from "./supabase";
import { publicRouter } from "./routes/public";
import { ordersRouter } from "./routes/orders";
import { accountRouter } from "./routes/account";
import { adminRouter } from "./routes/admin";
import { cronRouter } from "./routes/cron";
import { startInternalScheduler } from "./scheduler";

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: env.corsOrigins.includes("*") ? true : env.corsOrigins,
  }),
);

// 8mb ceiling accommodates base64 product-image uploads (5MB binary cap).
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  const status = integrationStatus();
  res.json({
    ok: true,
    brand: env.brandName,
    supabase: Boolean(supabase),
    email: status.resend,
    stripe: status.stripe,
    cron: status.cron,
    // Stripe webhooks are deliberately not used — payments are confirmed by an
    // admin in /admin/orders.
    stripeWebhooks: false,
  });
});

app.use("/api", ordersRouter);
app.use("/api", publicRouter);
app.use("/api/account", accountRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cron", requireDb, cronRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  reportBootConfig();
  startInternalScheduler();
  console.log(`${env.brandName} API listening on :${env.port}`);
});
