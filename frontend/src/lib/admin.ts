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
  ordersAwaitingConfirmation: number;
  ordersAwaitingFulfilment: number;
  ordersInTransit: number;
  guestOrders: number;
  products: number;
  productsOutOfStock: number;
  subscribers: number;
  unreadMessages: number;
  recentOrders: {
    id: string;
    email: string;
    status: string;
    paymentStatus: string;
    totalCents: number;
    createdAt: string;
  }[];
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
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  user_id: string | null;
  stripe_reported_status: string | null;
  stripe_amount_total_cents: number | null;
  account_invite_sent_at: string | null;
  origin_country?: string | null;
  risk_level?: string | null;
}

export interface AdminOrderEvent {
  id: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  message: string;
  notified: boolean;
  email_to: string | null;
  email_subject: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminOrderDetail extends AdminOrderRow {
  courier: string | null;
  origin_country: string | null;
  origin_region: string | null;
  origin_city: string | null;
  origin_network: string | null;
  origin_timezone: string | null;
  risk_level: string | null;
  risk_score: number | null;
  risk_flags: { code: string; label: string; explanation: string; weight: number }[];
  shipping: Record<string, string>;
  subtotal_cents: number;
  discount_cents: number;
  admin_notes: string | null;
  payment_ref: string | null;
  currency: string | null;
  confirmed_by_email: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_receipt_url: string | null;
  stripe_checked_at: string | null;
  refunded_cents: number | null;
  account_linked_at: string | null;
  delivery_updates_sent: number[] | null;
  last_delivery_update_at: string | null;
  last_notified_at: string | null;
  items: { product_slug: string; product_name: string; unit_price_cents: number; qty: number }[];
  events: AdminOrderEvent[];
}

export interface AdminPaidOrders {
  orders: AdminOrderRow[];
  totals: {
    count: number;
    revenueCents: number;
    last7DaysCents: number;
    last30DaysCents: number;
    awaitingFulfilment: number;
    inTransit: number;
    delivered: number;
    unlinkedAccounts: number;
  };
}

export type ServiceStatus = "ok" | "degraded" | "down" | "not_configured";

export interface AdminServiceReport {
  key: string;
  name: string;
  role: string;
  status: ServiceStatus;
  detail: string;
  meta?: Record<string, unknown>;
  docs?: string;
}

export interface AdminSystemReport {
  overall: ServiceStatus;
  checkedAt: string;
  services: AdminServiceReport[];
  app: {
    brand: string;
    domain: string;
    frontendUrl: string;
    environment: string;
    supportEmail: string;
    adminEmail: string;
    emailFrom: string;
    deliveryWindowDays: { min: number; max: number };
    deliveryUpdateDays: number[];
    manualPaymentApproval: boolean;
    stripeWebhooks: boolean;
    orderStatuses: string[];
    paidStatuses: string[];
  };
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
  "awaiting_confirmation",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

/** Human copy for each status, shown to admins next to the raw value. */
export const STATUS_HELP: Record<string, string> = {
  pending_payment: "Order created; the customer has not completed Stripe checkout.",
  awaiting_confirmation: "Customer paid on Stripe. Verify the money landed, then confirm.",
  paid: "Payment confirmed by an admin — the customer has been emailed and the build queue starts.",
  processing: "On the bench: frame prep, engine fitting, pre-ship shakedown.",
  shipped: "Crated and with the carrier. Add a tracking number before saving.",
  delivered: "Carrier confirmed delivery.",
  cancelled: "Order cancelled. Refund separately if money was taken.",
  refunded: "Money returned to the customer.",
};

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
    case "awaiting_confirmation":
      return "text-amber";
    default:
      return "text-silver";
  }
}

export function serviceTone(status: ServiceStatus): string {
  switch (status) {
    case "ok":
      return "text-success";
    case "degraded":
      return "text-amber";
    case "down":
      return "text-ember";
    default:
      return "text-silver";
  }
}

export const formatStatus = (status: string) => status.replace(/_/g, " ");
