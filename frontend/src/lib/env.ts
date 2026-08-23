/**
 * Environment access that survives Cloudflare Workers.
 *
 * The trap: `NEXT_PUBLIC_*` is inlined into the client bundle at BUILD time.
 * A value supplied only as a runtime Worker variable is an empty string in the
 * browser, and the feature that reads it dies silently — no error, no log.
 *
 * So there are three layers, in order of reliability:
 *   1. serverEnv()      — server code reads process.env, then the Worker's own
 *                         bindings via getCloudflareContext().
 *   2. window.__APP_ENV — the server injects what the browser needs into the
 *                         document on every request (see PublicEnvScript).
 *   3. /api/public-env  — a fetch fallback for STATICALLY PRERENDERED pages,
 *                         whose layout was rendered at build time and so
 *                         carries whatever __APP_ENV was true back then.
 */

/** Keys the browser is allowed to see. Nothing secret may ever appear here. */
export const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];
export type PublicEnv = Partial<Record<PublicEnvKey, string>>;

type CloudflareEnvLike = Record<string, unknown>;

/**
 * Server-side read. Falls back to the Worker's bindings, which is where a
 * value set in the Cloudflare dashboard (rather than at build time) lives.
 */
export function serverEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;

  try {
    // Imported lazily: this module is also pulled into client bundles, and the
    // adapter package has no browser build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: () => { env?: CloudflareEnvLike };
    };
    const value = mod.getCloudflareContext?.()?.env?.[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    // Not running on Workers (local dev, tests, the build itself).
    return undefined;
  }
}

/** The public subset, resolved server-side, for injection into the document. */
export function publicEnv(): PublicEnv {
  const out: PublicEnv = {};
  for (const key of PUBLIC_ENV_KEYS) {
    const value = serverEnv(key);
    if (value) out[key] = value;
  }
  return out;
}

declare global {
  interface Window {
    __APP_ENV?: PublicEnv;
  }
}

let fetched: PublicEnv | null = null;

/**
 * Client-side read. Build-time inlining first (it is correct whenever the value
 * was present at build), then the per-request injection, then the API route.
 */
export function clientEnv(key: PublicEnvKey): string | undefined {
  // Must be a static member expression — Next only inlines literal lookups.
  const inlined: PublicEnv = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  };
  if (inlined[key]) return inlined[key];
  if (typeof window !== "undefined" && window.__APP_ENV?.[key]) return window.__APP_ENV[key];
  if (fetched?.[key]) return fetched[key];
  return undefined;
}

/**
 * Third fallback, for prerendered pages: pulls the live values once and caches
 * them on the module. Callers that can await should prefer this over
 * clientEnv() when the value is load-bearing.
 */
export async function ensureClientEnv(): Promise<PublicEnv> {
  if (typeof window === "undefined") return publicEnv();
  if (fetched) return fetched;
  if (window.__APP_ENV) {
    fetched = window.__APP_ENV;
    return fetched;
  }
  try {
    const res = await fetch("/api/public-env", { cache: "no-store" });
    fetched = res.ok ? ((await res.json()) as PublicEnv) : {};
  } catch {
    fetched = {};
  }
  window.__APP_ENV = { ...fetched, ...(window.__APP_ENV ?? {}) };
  return fetched;
}
