import "dotenv/config";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: (optional("FRONTEND_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  corsOrigins: (optional("CORS_ORIGIN") ?? "*").split(",").map((o) => o.trim()).filter(Boolean),

  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),

  resendApiKey: optional("RESEND_API_KEY"),
  resendApiBase: optional("RESEND_API_BASE") ?? "https://api.resend.com",
  emailFrom: optional("EMAIL_FROM") ?? "Trike Nation <orders@trike-nation.com>",
  adminEmail: optional("ADMIN_EMAIL"),

  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripeApiBase: optional("STRIPE_API_BASE"), // test override only

  paypalClientId: optional("PAYPAL_CLIENT_ID"),
  paypalClientSecret: optional("PAYPAL_CLIENT_SECRET"),
  paypalApiBase:
    optional("PAYPAL_API_BASE") ??
    (optional("PAYPAL_ENV") === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com"),
};

export function reportBootConfig(): void {
  const state = (ok: unknown) => (ok ? "configured" : "MISSING");
  console.log("Trike Nation API configuration:");
  console.log(`  supabase:  ${state(env.supabaseUrl && env.supabaseServiceRoleKey)}`);
  console.log(`  resend:    ${state(env.resendApiKey)}`);
  console.log(`  stripe:    ${state(env.stripeSecretKey)}`);
  console.log(`  paypal:    ${state(env.paypalClientId && env.paypalClientSecret)}`);
  console.log(`  frontend:  ${env.frontendUrl}`);
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    console.error(
      "FATAL-ish: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "All data endpoints will return 503 until they are configured.",
    );
  }
}
