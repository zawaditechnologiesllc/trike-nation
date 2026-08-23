# Email catalog

Every email Go Cart Grip sends, what triggers it, and where the template lives. All sends go
through Resend from `EMAIL_FROM` with `EMAIL_REPLY_TO` as the reply address.

Templates: [`backend/src/email.ts`](../backend/src/email.ts).
Triggers: [`backend/src/orders/service.ts`](../backend/src/orders/service.ts).

## To the customer

| # | Trigger | Subject | Function |
| - | ------- | ------- | -------- |
| 1 | Order placed (Checkout Session created) | `We've got your order — #ABCD1234` | `sendOrderReceived` |
| 2 | Buyer returns from Stripe; the session sync reports paid | `Payment received, verifying — #ABCD1234` | `sendOrderStatusChanged` |
| 3 | **An admin confirms the payment** | `Payment confirmed — #ABCD1234` | `sendPaymentConfirmed` |
| 4 | Confirmation, buyer has no account | `Create your account to track #ABCD1234` | `sendAccountInvite` |
| 5 | Status → `processing` | `In the build queue — #ABCD1234` | `sendOrderStatusChanged` |
| 6 | Status → `shipped` | `Your order shipped — #ABCD1234` | `sendOrderStatusChanged` |
| 7 | Status → `delivered` | `Delivered — #ABCD1234` | `sendOrderStatusChanged` |
| 8 | Status → `cancelled` | `Order cancelled — #ABCD1234` | `sendOrderStatusChanged` |
| 9 | Status → `refunded` | `Refund issued — #ABCD1234` | `sendOrderStatusChanged` |
| 10 | Day 7 / 12 / 20 after confirmed payment (cron) | `Day 12 update — #ABCD1234` | `sendDeliveryUpdate` |
| 11 | Newsletter signup | `Welcome to the Crew` | `sendNewsletterWelcome` |

A guest whose payment is confirmed gets **both** #3 and #4: the receipt, and a separate invitation
to claim the order. That is intentional — the invitation is the thing that turns a one-off buyer
into an account, and burying it inside the receipt loses it.

Emails #3 and #5–#9 carry an optional **note to the customer** typed by the admin, rendered as a
quoted block. #6 includes the tracking number when one is set.

## To the team

| Trigger | Subject | Sent to | Function |
| ------- | ------- | ------- | -------- |
| Order placed | `Order awaiting confirmation — #ABCD1234 ($1,709.10)` | `ADMIN_EMAIL` | `sendAdminNewOrder` |
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
