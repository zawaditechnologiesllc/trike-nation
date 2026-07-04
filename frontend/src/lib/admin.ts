"use client";

import { getSupabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/** Authenticated fetch against the backend admin API. */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("Backend API is not configured (NEXT_PUBLIC_API_URL)");
  const supabase = getSupabase();
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function uploadImage(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const { url } = await adminFetch<{ url: string }>("/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
  });
  return url;
}

// Row shapes returned by the admin API (snake_case = raw table rows).

export interface AdminStats {
  revenueCents: number;
  ordersTotal: number;
  ordersPaid: number;
  ordersAwaitingFulfilment: number;
  products: number;
  productsOutOfStock: number;
  subscribers: number;
  unreadMessages: number;
  recentOrders: { id: string; email: string; status: string; totalCents: number; createdAt: string }[];
}

export interface AdminOrderRow {
  id: string;
  email: string;
  status: string;
  payment_status: string;
  payment_provider: string | null;
  total_cents: number;
  discount_code: string | null;
  tracking_number: string | null;
  created_at: string;
}

export interface AdminOrderDetail extends AdminOrderRow {
  shipping: Record<string, string>;
  subtotal_cents: number;
  discount_cents: number;
  admin_notes: string | null;
  payment_ref: string | null;
  user_id: string | null;
  items: { product_slug: string; product_name: string; unit_price_cents: number; qty: number }[];
}

export interface AdminDiscount {
  code: string;
  percent_off: number;
  active: boolean;
  created_at: string;
}

export interface AdminCustomer {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  created_at: string;
  orders: number;
  spent_cents: number;
}

export interface AdminMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface AdminTestimonial {
  id: string;
  name: string;
  initials: string;
  role: string;
  quote: string;
  rating: number;
}

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export function statusTone(status: string): string {
  switch (status) {
    case "paid":
    case "delivered":
      return "text-success";
    case "cancelled":
    case "refunded":
      return "text-ember";
    case "shipped":
    case "processing":
      return "text-blush";
    default:
      return "text-silver";
  }
}
