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
    specs: row.specs ?? [],
    boxContents: row.box_contents ?? [],
    features: row.features ?? [],
    image: row.image,
    featured: row.featured,
    inStock: row.in_stock,
  };
}
