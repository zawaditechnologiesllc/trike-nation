import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import { env } from "./env";

export const supabase: SupabaseClient | null =
  env.supabaseUrl && env.supabaseServiceRoleKey
    ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

/** Rejects requests until Supabase is configured — no synthetic data in production. */
export function requireDb(req: Request, res: Response, next: NextFunction): void {
  if (!supabase) {
    res.status(503).json({ error: "Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }
  next();
}

export function db(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  category_slug: string;
  price_cents: number;
  compare_at_cents: number | null;
  badges: string[];
  blurb: string;
  description: string;
  engine_size: string;
  width: string | null;
  length: string | null;
  tagline: string | null;
  status: string | null;
  colors: { name: string; hex: string | null }[] | null;
  specs: { label: string; value: string }[];
  box_contents: string[];
  features: { title: string; text: string }[];
  image: string;
  featured: boolean;
  in_stock: boolean;
}

export function toProduct(row: ProductRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category_slug,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents ?? undefined,
    badges: row.badges ?? [],
    blurb: row.blurb,
    description: row.description,
    engineSize: row.engine_size,
    // Dimensions reach the product page and the spec PDF. Absent stays absent
    // rather than becoming "N/A" — an invented measurement is a returned
    // machine and a shipping bill.
    width: row.width ?? undefined,
    length: row.length ?? undefined,
    tagline: row.tagline ?? undefined,
    status: row.status ?? undefined,
    // Without this the colour column is written by the importer and the admin
    // backfill and then read by nobody: the storefront and the PDF both fall
    // back to parsing the description, so a hand-edited colour list never
    // shows up.
    colors: row.colors ?? undefined,
    specs: row.specs ?? [],
    boxContents: row.box_contents ?? [],
    features: row.features ?? [],
    image: row.image,
    featured: row.featured,
    inStock: row.in_stock,
  };
}
