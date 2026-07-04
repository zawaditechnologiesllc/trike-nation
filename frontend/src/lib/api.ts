import { DEFAULT_SETTINGS } from "./defaults";
import type {
  CartItem,
  Category,
  OrderSummary,
  PaymentProvider,
  PaymentsConfig,
  Product,
  ShippingInfo,
  SiteSettings,
  Testimonial,
} from "./types";

/**
 * Client for the Render backend, which reads/writes Supabase. All storefront
 * data comes from the API — reads degrade to empty states (never synthetic
 * data) if it is unreachable.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

function requireApi(): string {
  if (!API_URL) {
    throw new Error("Store backend is not configured (NEXT_PUBLIC_API_URL). Contact support.");
  }
  return API_URL;
}

async function apiGet<T>(path: string, revalidate = 60): Promise<T | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function apiSend<T>(path: string, body: unknown, init?: { accessToken?: string; method?: string }): Promise<T> {
  const res = await fetch(`${requireApi()}${path}`, {
    method: init?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function fetchProducts(params?: { category?: string; featured?: boolean }): Promise<Product[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.featured) qs.set("featured", "true");
  return (await apiGet<Product[]>(`/api/products${qs.size ? `?${qs}` : ""}`)) ?? [];
}

export async function fetchProduct(slug: string): Promise<Product | undefined> {
  return (await apiGet<Product>(`/api/products/${slug}`)) ?? undefined;
}

export async function fetchCategories(): Promise<Category[]> {
  return (await apiGet<Category[]>("/api/categories")) ?? [];
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  return (await apiGet<Testimonial[]>("/api/testimonials")) ?? [];
}

export async function fetchSettings(): Promise<SiteSettings> {
  return (await apiGet<SiteSettings>("/api/settings", 120)) ?? DEFAULT_SETTINGS;
}

export async function fetchPaymentsConfig(): Promise<PaymentsConfig> {
  return (await apiGet<PaymentsConfig>("/api/payments/config", 0)) ?? { stripe: false, paypal: false };
}

export async function fetchOrderStatus(id: string): Promise<OrderSummary | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/api/orders/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as OrderSummary;
  } catch {
    return null;
  }
}

export async function validateDiscount(code: string): Promise<number | null> {
  try {
    const data = await apiSend<{ percentOff: number }>("/api/discounts/validate", {
      code: code.trim().toUpperCase(),
    });
    return data.percentOff;
  } catch {
    return null;
  }
}

export async function subscribeNewsletter(email: string): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await apiSend<{ message: string }>("/api/newsletter", { email });
    return { ok: true, message: data.message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Subscription failed." };
  }
}

export async function sendContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await apiSend<{ message: string }>("/api/contact", input);
    return { ok: true, message: data.message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not send message." };
  }
}

/**
 * Creates the order server-side and returns the payment redirect (Stripe
 * hosted Checkout or PayPal approval page). The cart is cleared on the
 * success page, after payment — not before.
 */
export async function placeOrder(input: {
  items: CartItem[];
  shipping: ShippingInfo;
  provider: PaymentProvider;
  discountCode?: string;
  accessToken?: string;
}): Promise<OrderSummary> {
  return apiSend<OrderSummary>(
    "/api/orders",
    {
      items: input.items.map((i) => ({ slug: i.slug, qty: i.qty })),
      shipping: input.shipping,
      provider: input.provider,
      discountCode: input.discountCode,
    },
    { accessToken: input.accessToken },
  );
}

export async function capturePaypal(orderId: string, paypalOrderId: string): Promise<{ ok: boolean; status: string }> {
  return apiSend<{ ok: boolean; status: string }>("/api/payments/paypal/capture", { orderId, paypalOrderId });
}
