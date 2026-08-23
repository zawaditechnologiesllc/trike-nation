import { Router } from "express";
import { db, requireDb } from "../supabase";
import { getUserFromRequest } from "../auth";
import { claimOrdersForUser } from "../orders/service";

/**
 * The signed-in customer's own view of their orders. Reads go through the
 * service role but are always constrained to the caller's user id *or* email,
 * so a guest order placed with the same address shows up here too.
 */
export const accountRouter = Router();
accountRouter.use(requireDb);

accountRouter.use(async (req, res, next) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user = user;
  next();
});

// Kept as one literal so supabase-js can type the rows (see orders/service.ts).
const ORDER_FIELDS =
  "id, status, payment_status, total_cents, subtotal_cents, discount_cents, discount_code, tracking_number, created_at, paid_at, shipped_at, delivered_at, user_id, email, order_number";
const ORDER_DETAIL_FIELDS =
  "id, status, payment_status, total_cents, subtotal_cents, discount_cents, discount_code, tracking_number, created_at, paid_at, shipped_at, delivered_at, user_id, email, shipping, order_number";

function shape(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    orderNumber: (row.order_number as string | null) ?? undefined,
    status: row.status as string,
    paymentStatus: row.payment_status as string,
    subtotalCents: row.subtotal_cents as number,
    discountCents: row.discount_cents as number,
    totalCents: row.total_cents as number,
    discountCode: (row.discount_code as string | null) ?? undefined,
    trackingNumber: (row.tracking_number as string | null) ?? undefined,
    createdAt: row.created_at as string,
    paidAt: (row.paid_at as string | null) ?? undefined,
    shippedAt: (row.shipped_at as string | null) ?? undefined,
    deliveredAt: (row.delivered_at as string | null) ?? undefined,
  };
}

accountRouter.get("/orders", async (req, res) => {
  const user = req.user!;
  // Adopt anything placed as a guest with this address before listing.
  if (user.email) await claimOrdersForUser(user.id, user.email);

  const filter = user.email
    ? `user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`
    : `user_id.eq.${user.id}`;

  const { data, error } = await db()
    .from("orders")
    .select(ORDER_FIELDS)
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[account] order list failed", error);
    return res.status(500).json({ error: "Could not load your orders" });
  }

  const orders = data ?? [];
  const ids = orders.map((o) => o.id as string);
  const itemsByOrder = new Map<string, { name: string; qty: number; unitCents: number }[]>();
  if (ids.length) {
    const { data: items } = await db()
      .from("order_items")
      .select("order_id, product_name, product_slug, qty, unit_price_cents")
      .in("order_id", ids);
    for (const item of items ?? []) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push({ name: item.product_name, qty: item.qty, unitCents: item.unit_price_cents });
      itemsByOrder.set(item.order_id, list);
    }
  }

  res.json(orders.map((row) => ({ ...shape(row), items: itemsByOrder.get(row.id as string) ?? [] })));
});

accountRouter.get("/orders/:id", async (req, res) => {
  const user = req.user!;
  const { data: order } = await db()
    .from("orders")
    .select(ORDER_DETAIL_FIELDS)
    .eq("id", req.params.id)
    .maybeSingle();

  const owns =
    order &&
    (order.user_id === user.id ||
      (user.email && String(order.email).toLowerCase() === user.email.toLowerCase()));
  if (!owns) return res.status(404).json({ error: "Order not found" });

  const [{ data: items }, { data: events }] = await Promise.all([
    db()
      .from("order_items")
      .select("product_name, product_slug, qty, unit_price_cents")
      .eq("order_id", order.id),
    db()
      .from("order_events")
      .select("type, to_status, message, created_at")
      .eq("order_id", order.id)
      .in("type", ["status_change", "payment_confirmed", "delivery_update", "account_linked"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  res.json({
    ...shape(order),
    shipping: order.shipping,
    items: (items ?? []).map((i) => ({
      name: i.product_name,
      slug: i.product_slug,
      qty: i.qty,
      unitCents: i.unit_price_cents,
    })),
    timeline: (events ?? []).map((e) => ({
      type: e.type,
      status: e.to_status,
      message: e.message,
      at: e.created_at,
    })),
  });
});
