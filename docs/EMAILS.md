# Email catalog

Every email Go Cart Grip sends, what triggers it, and where the template lives. All sends go
through Resend from `EMAIL_FROM` with `EMAIL_REPLY_TO` as the reply address.

Templates: [`backend/src/email.ts`](../backend/src/email.ts).
Triggers: [`backend/src/orders/service.ts`](../backend/src/orders/service.ts).

## To the customer

| # | Trigger | Subject | Function |
| - | ------- | ------- | -------- |
| 1 | Order placed (Checkout Session created) | `We've got your order — GCG-2026-0148` | `sendOrderReceived` |
| 2 | Buyer returns from Stripe; the session sync reports paid | `Payment received, verifying — GCG-2026-0148` | `sendOrderStatusChanged` |
| 3 | **An admin confirms the payment** | `Payment confirmed — GCG-2026-0148` | `sendPaymentConfirmed` |
| 4 | Confirmation, buyer has no account | `Create your account to track GCG-2026-0148` | `sendAccountInvite` |
| 5 | Status → `processing` | `In the build queue — GCG-2026-0148` | `sendOrderStatusChanged` |
| 6 | Status → `shipped` | `Your order shipped — GCG-2026-0148` | `sendOrderStatusChanged` |
| 7 | Status → `delivered` | `Delivered — GCG-2026-0148` | `sendOrderStatusChanged` |
| 8 | Status → `cancelled` | `Order cancelled — GCG-2026-0148` | `sendOrderStatusChanged` |
| 9 | Status → `refunded` | `Refund issued — GCG-2026-0148` | `sendOrderStatusChanged` |
| 10 | Day 7 / 12 / 20 after confirmed payment (cron) | `In transit — final stretch — GCG-2026-0148` | `sendDeliveryUpdate` |
| 11 | Order placed but never paid, then day 3 / 7 / 12 | `You left something in your cart` | `sendAbandonedCart` |
| 12 | Newsletter signup | `Welcome to the Crew` | `sendNewsletterWelcome` |

**The abandoned-cart email is not a confirmation.** Sending one for an unpaid
order teaches customers that "confirmed" means nothing. It shows what they
chose and links back to a cart that still has it.

Chasing stops permanently the moment that address buys anything, and the
purchase check fails **safe** — if it errors, the send is skipped, because
emailing "you left something behind" to somebody who already paid is worse than
silence. It never invents a discount, a deadline or a stock scare.

A guest whose payment is confirmed gets **both** #3 and #4: the receipt, and a separate invitation
to claim the order. That is intentional — the invitation is the thing that turns a one-off buyer
into an account, and burying it inside the receipt loses it.

Emails #3 and #5–#9 carry an optional **note to the customer** typed by the admin, rendered as a
quoted block.

A tracking number is rendered as a **link** only when the courier has a known
tracking URL and the number is not one we generated ourselves — a link that
lands on "not found" makes the customer think nothing shipped. Otherwise it is
shown as plain text.

The shipped email carries the buffer sentence: without it a three-week estimate
reads as a slow shop; with it, it reads as a careful one and the buyer stops
watching the calendar.

Order references use the human number (`GCG-2026-0148`) where one exists,
falling back to the short uuid for rows created before numbering.

That string comes from `orderReference` in `shared/core/orders.ts`, and every
screen reads the same function — the order page, the account list, the admin
tables. A second implementation is how a buyer ends up with an email naming
`GCG-2026-0148` and an order page headed `#CA152614`, unable to tell that they
are the same order. Any new email or screen must call it rather than slicing
the uuid itself.

## To the team

| Trigger | Subject | Sent to | Function |
| ------- | ------- | ------- | -------- |
| Order placed | `Order awaiting confirmation — GCG-2026-0148 ($1,709.10)` | `ADMIN_EMAIL` | `sendAdminNewOrder` |
| Contact form submitted | `New contact message: <subject>` | `ADMIN_EMAIL` | `sendContactNotification` |

The new-order alert is what stops a payment sitting unconfirmed — it links straight to the order in
the admin panel. The contact notification sets `reply_to` to the sender, so replying goes to the
customer.

## What every email contains

A shared dark-themed shell with the brand header, the support address, and a link to
`gocartgrip.shop`. Order emails also carry a line-item table with subtotal, discount, free
shipping, and total, and a button to the order's tracking page (`/orders/<id>`), which works
without an account.

All interpolated values are HTML-escaped, including customer names, notes, and contact-form
messages.

## Delivery-progress copy

| Day | Message |
| --- | ------- |
| 7 | Frame prep cleared, assembly underway. Nothing needed from the customer. |
| 12 | Assembly and pre-ship shakedown done or close to it; crating next. |
| 20 | With the carrier and moving; tell us if tracking looks stuck. |

Milestones come from `DELIVERY_UPDATE_DAYS` (default `7,12,20`). Changing that variable changes
which days fire; days without specific copy fall back to a generic progress message.

## Delivery and failures

Sends are asynchronous and never block an order update — a Resend outage cannot stop an admin from
confirming a payment or shipping an order.

Every send is recorded in `order_events` with `notified`, `email_to`, `email_subject`, and either
the Resend message id or the error, all visible on the order's timeline in the admin panel. If a
customer says an email never arrived, the timeline says whether it was sent.

**Re-send current status email** on the order page re-sends the notification for the order's
current status. The **Day 7 / 12 / 20** buttons re-send a progress update.

When `RESEND_API_KEY` is unset the send is skipped with a warning in the logs and recorded as not
notified — the order still moves.

## Changing a template

Templates are plain functions returning HTML strings in `backend/src/email.ts`. Edit the copy, then
run the flow against the local stubs and read the result at <http://localhost:4603/sent>:

```bash
node scripts/dev-stubs/stubs.mjs          # captures every send
```

Keep `escape()` around anything that came from a customer.
