import cors from "cors";
import express from "express";
import { env, reportBootConfig } from "./env";
import { requireDb, supabase } from "./supabase";
import { publicRouter } from "./routes/public";
import { ordersRouter, webhooksRouter } from "./routes/orders";
import { adminRouter } from "./routes/admin";
import { stripe } from "./payments/stripe";
import { paypalEnabled } from "./payments/paypal";

const app = express();
app.use(
  cors({
    origin: env.corsOrigins.includes("*") ? true : env.corsOrigins,
  }),
);

// Stripe webhooks need the raw body for signature verification, so this
// router mounts before the JSON parser.
app.use("/api/webhooks", requireDb, webhooksRouter);

// 8mb ceiling accommodates base64 product-image uploads (5MB binary cap).
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    supabase: Boolean(supabase),
    email: Boolean(env.resendApiKey),
    stripe: Boolean(stripe),
    paypal: paypalEnabled(),
  });
});

app.use("/api", ordersRouter);
app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  reportBootConfig();
  console.log(`Trike Nation API listening on :${env.port}`);
});
