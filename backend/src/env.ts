import "dotenv/config";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function bool(name: string, fallback = false): boolean {
  const value = optional(name)?.toLowerCase();
  if (value === undefined) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function intList(name: string, fallback: number[]): number[] {
  const raw = optional(name);
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((n) => Math.round(Number(n.trim())))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : fallback;
}

const domain = optional("BRAND_DOMAIN") ?? "gocartgrip.shop";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: optional("NODE_ENV") ?? "development",
  frontendUrl: (optional("FRONTEND_URL") ?? "https://gocartgrip.shop").replace(/\/$/, ""),
  corsOrigins: (optional("CORS_ORIGIN") ?? "*").split(",").map((o) => o.trim()).filter(Boolean),

  brandName: optional("BRAND_NAME") ?? "Go Cart Grip",
  brandDomain: domain,

  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),

  resendApiKey: optional("RESEND_API_KEY"),
  resendApiBase: optional("RESEND_API_BASE") ?? "https://api.resend.com",
  emailFrom: optional("EMAIL_FROM") ?? `Go Cart Grip <orders@${domain}>`,
  emailReplyTo: optional("EMAIL_REPLY_TO") ?? `support@${domain}`,
  adminEmail: optional("ADMIN_EMAIL") ?? `admin@${domain}`,
  supportEmail: optional("SUPPORT_EMAIL") ?? `support@${domain}`,

  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripePublishableKey: optional("STRIPE_PUBLISHABLE_KEY"),
  stripeApiBase: optional("STRIPE_API_BASE"), // test/stub override only
  stripeCurrency: (optional("STRIPE_CURRENCY") ?? "usd").toLowerCase(),

  /** Shared secret the cron caller presents to POST /api/cron/*. */
  cronSecret: optional("CRON_SECRET"),
  /** Run the delivery-update sweep inside this process (dev / single-instance). */
  internalCron: bool("ENABLE_INTERNAL_CRON", false),
  /** Days after payment confirmation at which customers get a progress email. */
  deliveryUpdateDays: intList("DELIVERY_UPDATE_DAYS", [7, 12, 20]),
  deliveryMinDays: Number(optional("DELIVERY_MIN_DAYS") ?? 12),
  deliveryMaxDays: Number(optional("DELIVERY_MAX_DAYS") ?? 30),

  /** One year — product images are content-addressed by upload timestamp. */
  imageCacheSeconds: Number(optional("IMAGE_CACHE_SECONDS") ?? 31536000),
};

export function integrationStatus() {
  return {
    supabase: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
    resend: Boolean(env.resendApiKey),
    stripe: Boolean(env.stripeSecretKey),
    cron: Boolean(env.cronSecret) || env.internalCron,
  };
}

export function reportBootConfig(): void {
  const state = (ok: unknown) => (ok ? "configured" : "MISSING");
  const status = integrationStatus();
  console.log(`${env.brandName} API configuration:`);
  console.log(`  supabase:  ${state(status.supabase)}`);
  console.log(`  resend:    ${state(status.resend)}`);
  console.log(`  stripe:    ${state(status.stripe)}`);
  console.log(`  cron:      ${state(status.cron)}${env.internalCron ? " (internal scheduler on)" : ""}`);
  console.log(`  frontend:  ${env.frontendUrl}`);
  console.log(`  updates:   day ${env.deliveryUpdateDays.join(", ")} after payment`);
  if (!status.supabase) {
    console.error(
      "FATAL-ish: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "All data endpoints will return 503 until they are configured.",
    );
  }
}
