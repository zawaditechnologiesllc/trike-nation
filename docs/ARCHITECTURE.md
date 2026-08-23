# Architecture

How Go Cart Grip is put together, and why the unusual parts are the way they are.

- [Services](#services)
- [Why there are no Stripe webhooks](#why-there-are-no-stripe-webhooks)
- [Order lifecycle](#order-lifecycle)
- [Guest orders become accounts](#guest-orders-become-accounts)
- [Delivery updates](#delivery-updates)
- [Data model](#data-model)
- [Security model](#security-model)
- [Repository layout](#repository-layout)

## Services

```
                    ┌──────────────────────────┐
   customer ───────►│  Storefront              │  Next.js 16 → OpenNext
                    │  Cloudflare Workers      │  gocartgrip.shop
                    └───────────┬──────────────┘
                                │ fetch (NEXT_PUBLIC_API_URL)
                                ▼
                    ┌──────────────────────────┐
                    │  API                     │  Express + TypeScript
                    │  Render                  │  gocartgrip-api
                    └──┬────────┬────────┬─────┘
       service role    │        │        │
                       ▼        ▼        ▼
                ┌──────────┐ ┌──────┐ ┌────────┐
                │ Supabase │ │Stripe│ │ Resend │
                │ pg+auth  │ │      │ │        │
                │ +storage │ └──────┘ └────────┘
                └──────────┘
                                ▲
                                │ POST /api/cron/delivery-updates (CRON_SECRET)
                    ┌───────────┴──────────────┐
                    │  Delivery cron           │  scheduled Worker, daily
                    │  Cloudflare Workers      │  gocartgrip-cron
                    └──────────────────────────┘
```

The browser talks to two things: the API for all storefront data and orders, and Supabase directly
for authentication only (email + password). Everything that touches money, email, or the database
goes through the API with the service-role key — the browser never holds a privileged credential.

## Why there are no Stripe webhooks

Stripe's webhook delivery is not relied on here. There is no webhook endpoint, no
`STRIPE_WEBHOOK_SECRET`, and no signature verification code — nothing to misfire, replay, or
silently stop delivering.

Payment state is **pulled**, not pushed:

1. Checkout Session is created with `success_url` carrying `{CHECKOUT_SESSION_ID}`.
2. The buyer returns to `/checkout/success?order=<id>&session_id=<cs_…>`.
3. That page calls `POST /api/orders/:id/sync`, which retrieves the session from the Stripe API
   and writes what Stripe reports onto the order: `stripe_reported_status`,
   `stripe_amount_total_cents`, `stripe_payment_intent_id`, `stripe_charge_id`,
   `stripe_receipt_url`, `stripe_checked_at`.
4. The order moves to `awaiting_confirmation` — **never** to `paid`.
5. An admin reviews it and confirms the payment by hand.

The trade-off is deliberate. Nothing marks an order paid automatically, so a buyer who closes the
tab before returning stays in `pending_payment` until an admin re-reads the session from
`/admin/orders/<id>` ("Re-read from Stripe"). The admin's new-order email and the needs-action
queue exist so those orders are never missed.

The sync also compares Stripe's `amount_total` to the order total and flags a mismatch on the
order page before an admin can confirm it.

## Order lifecycle

| Status                  | Set by                        | Customer email                     |
| ----------------------- | ----------------------------- | ---------------------------------- |
| `pending_payment`       | order creation                | "We've got your order"             |
| `awaiting_confirmation` | the Stripe session sync       | "Payment received, verifying"      |
| `paid`                  | **an admin, by hand**         | "Payment confirmed" (+ invite)     |
| `processing`            | an admin                      | "In the build queue"               |
| `shipped`               | an admin (+ tracking number)  | "Your order shipped"               |
| `delivered`             | an admin                      | "Delivered"                        |
| `cancelled`             | an admin                      | "Order cancelled"                  |
| `refunded`              | an admin (via Stripe refund)  | "Refund issued"                    |

`payment_status` tracks the money separately: `unpaid` → `pending_review` → `paid`, plus `failed`
and `refunded`. Revenue counts `payment_status = 'paid'` only, which is why a confirmed payment is
the thing that moves the revenue number, not a completed Stripe checkout.

Every transition goes through one function — `setOrderStatus` in
[`backend/src/orders/service.ts`](../backend/src/orders/service.ts) — so the row update, the
`order_events` timeline entry, and the customer email always happen together. Nothing else in the
codebase writes `orders.status`.

Timestamps (`paid_at`, `processing_at`, `shipped_at`, `delivered_at`, `cancelled_at`,
`refunded_at`) are first-write-wins, so re-saving a status does not rewrite history.

## Guest orders become accounts

Delivery takes 12–30 days, so buyers need somewhere to watch the order. Confirming a payment is
what attaches it:

- an account already exists with the order's email → the order is linked immediately;
- no account → the buyer is emailed an invitation whose link prefills that address.

Three independent paths make the link, so it cannot be missed:

1. **Postgres trigger** — `on_profile_created_link_orders` (migration 003) claims every unlinked
   order with a matching email the moment a profile row is created.
2. **Claim endpoint** — `POST /api/orders/claim`, called by the frontend right after sign-in and
   sign-up, covers orders placed as a guest *after* the account existed.
3. **Claim on read** — `GET /api/account/orders` runs the same claim before listing.

Row Level Security also matches orders by the signed-in user's JWT email, so a guest order is
visible in the account the moment they sign up, even before a link lands.

## Delivery updates

`workers/cron` is a Cloudflare scheduled Worker. Once a day it calls
`POST /api/cron/delivery-updates` with `CRON_SECRET`; the API emails every in-flight order
(`status` in paid/processing/shipped, `payment_status = 'paid'`) its day 7 / 12 / 20 progress
update, counted from `paid_at`.

The sweep is idempotent. Milestones already sent are stored in `orders.delivery_updates_sent`, and
when several milestones are due at once only the newest is emailed while all of them are marked —
so a cron outage produces one catch-up email, never a burst of backdated ones.

Milestones are configurable with `DELIVERY_UPDATE_DAYS` (default `7,12,20`).

## Data model

Tables added or extended for this flow (see
[`supabase/migrations/003_manual_approval.sql`](../supabase/migrations/003_manual_approval.sql)):

**`orders`** — beyond the basics, carries the Stripe audit trail (`stripe_session_id`,
`stripe_payment_intent_id`, `stripe_charge_id`, `stripe_reported_status`,
`stripe_amount_total_cents`, `stripe_receipt_url`, `stripe_checked_at`), who confirmed it
(`confirmed_by`, `confirmed_by_email`), lifecycle timestamps, cron bookkeeping
(`delivery_updates_sent`, `last_delivery_update_at`), and account linking
(`account_invite_sent_at`, `account_linked_at`). `status` and `payment_status` are constrained by
check constraints.

**`order_events`** — the timeline and the notification audit log. One row per status change,
payment confirmation, delivery update, account invite/link, or note, recording the actor, the
message, and whether the email actually sent (`notified`, `email_to`, `email_subject`, plus the
Resend id or error in `metadata`).

**`system_state`** — key/value heartbeats. The delivery cron writes `delivery_cron` here on every
sweep, which is what `/admin/system` reads to tell you whether the schedule is alive.

## Security model

- The service-role key lives only on the API. The browser gets the anon key, used for auth only.
- Order totals are always recomputed server-side from the products table; client totals and
  client-supplied prices are ignored entirely.
- Discount codes are validated server-side against `discount_codes` on every order.
- `/api/admin/**` requires a valid Supabase JWT whose profile has `is_admin = true`.
- `/api/cron/**` requires `CRON_SECRET`, compared with a constant-time comparison.
- `GET /api/orders/:id` is public but keyed by an unguessable uuid and returns a safe subset only —
  no shipping address, and the buyer's email masked to `j****@example.com`.
- RLS lets a signed-in user read only their own profile, orders, order items, and order events,
  matched by user id **or** JWT email. Everything else is written exclusively by the service role.

## Repository layout

```
backend/           Express API (Render)
  src/env.ts         configuration + integration status
  src/email.ts       every Resend template
  src/orders/        setOrderStatus, account linking, Stripe sync, cron sweep
  src/payments/      Stripe client (checkout, session retrieve, refunds)
  src/routes/        public, orders, account, admin, cron
  src/scheduler.ts   optional in-process cron fallback
frontend/          Next.js storefront + admin (Cloudflare Workers via OpenNext)
  src/lib/brand.ts   name, domain, department inboxes
  src/app/admin/     admin panel, incl. orders/paid and system
workers/cron/      scheduled Worker that drives the delivery sweep
supabase/          migrations + seed
data/              canonical seed sources for the catalog and site settings
scripts/           seed generator, dev stubs, production deploy script
docs/              this documentation
```
