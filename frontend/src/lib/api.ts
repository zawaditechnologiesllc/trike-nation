import { CATEGORIES, DISCOUNT_CODES, PRODUCTS, TESTIMONIALS, getProduct } from "./catalog";
import type { CartItem, Category, OrderSummary, Product, ShippingInfo, Testimonial } from "./types";

/**
 * Thin client for the Render backend. Every read falls back to the bundled
 * catalog so the storefront is fully browsable before the backend/Supabase
 * are provisioned (and if they are ever unreachable).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

async function apiGet<T>(path: string): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchProducts(params?: { category?: string; featured?: boolean }): Promise<Product[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.featured) qs.set("featured", "true");
  const remote = await apiGet<Product[]>(`/api/products${qs.size ? `?${qs}` : ""}`);
  if (remote && remote.length) return remote;
  let list = PRODUCTS;
  if (params?.category) list = list.filter((p) => p.category === params.category);
  if (params?.featured) list = list.filter((p) => p.featured);
  return list;
}

export async function fetchProduct(slug: string): Promise<Product | undefined> {
  const remote = await apiGet<Product>(`/api/products/${slug}`);
  return remote ?? getProduct(slug);
}

export async function fetchCategories(): Promise<Category[]> {
  const remote = await apiGet<Category[]>("/api/categories");
  return remote && remote.length ? remote : CATEGORIES;
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  const remote = await apiGet<Testimonial[]>("/api/testimonials");
  return remote && remote.length ? remote : TESTIMONIALS;
}

export async function validateDiscount(code: string): Promise<number | null> {
  const normalized = code.trim().toUpperCase();
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/api/discounts/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      if (res.ok) {
        const data = (await res.json()) as { percentOff: number };
        return data.percentOff;
      }
      if (res.status === 404) return null;
    } catch {
      // fall through to local codes
    }
  }
  return DISCOUNT_CODES[normalized] ?? null;
}

export async function subscribeNewsletter(email: string): Promise<{ ok: boolean; message: string }> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/api/newsletter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data.message ?? (res.ok ? "You're in. Welcome to the Nation." : "Subscription failed.") };
    } catch {
      // fall through
    }
  }
  return { ok: true, message: "You're in. Welcome to the Nation. (demo mode — backend not connected)" };
}

export async function placeOrder(input: {
  items: CartItem[];
  shipping: ShippingInfo;
  discountCode?: string;
  accessToken?: string;
}): Promise<OrderSummary> {
  if (API_URL) {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
      },
      body: JSON.stringify({
        items: input.items.map((i) => ({ slug: i.slug, qty: i.qty })),
        shipping: input.shipping,
        discountCode: input.discountCode,
      }),
    });
    if (res.ok) return (await res.json()) as OrderSummary;
    const err = await res.json().catch(() => ({ error: "Order failed" }));
    throw new Error(err.error ?? "Order failed");
  }
  // Demo mode: no backend configured — compute totals locally.
  const subtotal = input.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
  const pct = input.discountCode ? (DISCOUNT_CODES[input.discountCode.toUpperCase()] ?? 0) : 0;
  const discount = Math.round((subtotal * pct) / 100);
  return {
    id: `DEMO-${Date.now().toString(36).toUpperCase()}`,
    status: "demo",
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: subtotal - discount,
    discountCode: pct ? input.discountCode?.toUpperCase() : undefined,
    demo: true,
  };
}
