# Operations guide

Running the store day to day: confirming payments, moving orders, adding products, and fixing
things when they break. Written for whoever is holding the admin login.

- [The daily loop](#the-daily-loop)
- [Confirming a payment](#confirming-a-payment)
- [Moving an order along](#moving-an-order-along)
- [Refunds and cancellations](#refunds-and-cancellations)
- [Customer accounts](#customer-accounts)
- [Products and images](#products-and-images)
- [Bulk import](#bulk-import)
- [Tracking and couriers](#tracking-and-couriers)
- [Announcements](#announcements)
- [Order origin and fraud flags](#order-origin-and-fraud-flags)
- [The trust checklist](#the-trust-checklist)
- [The System page](#the-system-page)
- [Troubleshooting](#troubleshooting)

## The daily loop

Open `/admin` and work top down:

1. **Payments to confirm** — the red banner on the dashboard. These customers have paid and are
   waiting on you; nothing else in the store matters more.
2. **Awaiting fulfilment** — confirmed orders that have not been marked processing or shipped.
3. **Messages** — the contact-form inbox.

Everything else (revenue, products, subscribers) is reporting, not work.

## Confirming a payment

Payments are **never** confirmed automatically. This is the deliberate centre of the system: the
store does not trust a Stripe callback to decide that money arrived.

1. `/admin/orders?status=needs_action`, or click the dashboard banner.
2. Open the order. The red panel at the top tells you what Stripe reports.
3. Check the payment in your Stripe dashboard. Look for: the amount matches the order total, the
   charge succeeded, and it is not flagged for review.
4. If the panel says Stripe has not reported a completed payment, press **Re-read from Stripe** —
   this pulls the session again. Buyers who close the tab before returning to the site sit in
   `pending_payment` until someone does this.
5. Optionally write a **note to the customer**; it is appended to the email they receive.
6. Press **Confirm Payment as Paid**.

Confirming does four things at once:

- moves the order to `paid` and stamps `paid_at` (which starts the delivery clock);
- emails the customer their confirmation;
- links the order to their account, or emails them an invitation to create one;
- records who confirmed it on the order timeline.

**Never confirm an order whose amount does not match.** The order page prints a mismatch in red.
Investigate in Stripe first — a partial capture or a wrong-currency charge shows up this way.

## Moving an order along

Use the Fulfilment panel on the order page. Every status change emails the customer by default.

| Set to       | When                                | What the customer gets                      |
| ------------ | ----------------------------------- | -------------------------------------------- |
| `processing` | the build starts                    | "In the build queue"                         |
| `shipped`    | the crate leaves — **add tracking** | "Your order shipped" with the tracking number |
| `delivered`  | the carrier confirms                | "Delivered" plus first-ride advice            |

Add the tracking number **before** saving `shipped` — it goes in that same email.

**Note to the customer** adds a line to the email. **Internal notes** are never sent.

Untick **"Email the customer about this change"** only when correcting a mistake — for example if
you set `delivered` on the wrong order and need to set it back without confusing the buyer.

Customers also get automatic progress emails on day 7, 12, and 20 after payment confirmation.
You do not need to send those; the cron does. The **Day 7 / 12 / 20** buttons on the order page
exist to re-send one on request.

**Re-send current status email** re-sends the notification for whatever status the order is in
now — useful when a customer says they never got it.

## Refunds and cancellations

Two different actions:

- **Refund** (Stripe section of the order page) actually moves the money back through Stripe, then
  sets the order to `refunded` and emails the customer. It needs a payment intent on the order, so
  press "Re-read from Stripe" first if the field is empty.
- **Cancelled** (status dropdown) only marks the order cancelled and emails the customer. It moves
  no money. Use it for an order that was never paid, or refund first and then cancel.

Refunds are full by default. Partial refunds go through the Stripe dashboard; afterwards, set the
order status by hand here so the customer is told.

## Customer accounts

Guests can order without an account, and most do. When you confirm their payment:

- if an account already exists on that email → the order is linked instantly and the panel says
  "Linked";
- if not → they are emailed an invitation, and the panel says "Invitation sent".

Their order attaches automatically the moment they sign up with the same address — you do not have
to do anything. **Re-send invite** on the order page is there for a customer who lost the email.

The account column in the order lists shows `linked` / `invited` / `guest` at a glance, and Paid
Orders counts how many confirmed orders still have no account.

## Products and images

`/admin/products` → **New Product**, or open an existing one.

Images: upload a file or paste a URL. Uploads go to Supabase Storage under a timestamped filename,
which makes each image URL permanent, so it is cached for a full year in browsers and at
Cloudflare's edge.

That has one consequence worth knowing: **replacing a product image means uploading a new file**,
not overwriting the old one. Upload the new image and save — the product picks up a fresh URL and
customers see it immediately. There is no cache to purge.

Upload rules: images only, 5 MB maximum. Upload them at the size you want them served — the store
does not resize images.

## Bulk import

`/admin/import` takes a plain-text product sheet. Fields can be in any order and
under their usual names (`Product`/`Title`, `Details`/`About`, `Was`/`RRP`),
bulleted `Specs:` and `In the box:` sections become lists, and colours can be
written any of the three usual ways.

**Always press Preview first.** It parses the sheet and tells you exactly what
would be created, updated, skipped and why — and saves nothing. Then Import.

A block with no readable price is refused rather than imported at zero, and the
result names every product it created, updated or could not read. If a product
does not appear in the list, it did not import.

Re-importing updates by slug, and never overwrites a colour list you edited by
hand in the product form.

## Tracking and couriers

The order page has a courier dropdown of about 115 carriers grouped by region,
plus "Other — type it in".

Below the tracking field, a line tells you **before you save** whether the
customer will get a clickable link. They only do when the courier is known and
the number is a real carrier number. That matters because a link that lands on
"not found" makes the customer think nothing shipped.

**Generate** creates an internal reference like `GCG-2608-3KN6Z4-V` for an order
that has left but has no carrier number yet. Those are always shown as plain
text, never linked — and the preview line says so.

## Announcements

`/admin/announcements` controls the stripe scrolling across the top of every
page. Each notice has its own position and an optional start and end time; a
scheduled one is not sent to the browser until it starts, so it cannot leak
early to anyone reading the page source.

Pause hides a notice without deleting it. With no notices at all, the stripe
falls back to the ticker in Site Settings.

## Order origin and fraud flags

Each order records where the connection came from and what timezone the
browser reported. That pair is the useful one — a VPN moves the address but not
the clock. **No IP address is stored.**

The order list shows a country column, with a dot only when something is worth a
look. The order page explains every flag in plain English.

**None of this is a reason to refuse an order.** A corporate VPN, a
privacy-minded customer, an expat and a traveller all trip these signals. Card
fraud is stopped in Stripe — issuing-country mismatch, CVC and postcode checks,
and 3DS liability shift are all settings in the Stripe dashboard, and they are
what actually works.

## The trust checklist

`/admin/system` lists anything still holding a shipped default — the address,
the phone number, the legal name, the logo. Each says why a trust checker
cares.

Those values are **omitted** from the site's structured data while they are
placeholders, on purpose: a fictional address that a checker follows and cannot
find scores lower than no address at all. Filling them in is the single biggest
signal a new domain can add.

The same page lists what must never be built — chiefly review or rating markup
for reviews that do not exist, which is the commonest cause of a
structured-data penalty on the whole domain.

## The System page

`/admin/system` checks every connected service live, on every page load:

| Service            | Green means                                                    |
| ------------------ | -------------------------------------------------------------- |
| Supabase           | the database answered a real query                              |
| Stripe             | the account is reachable and charges are enabled                |
| Resend             | the API key works and the sending domain is verified            |
| Supabase Storage   | the `product-images` bucket is reachable and public             |
| Delivery cron      | the sweep ran within the last 36 hours                          |
| Cloudflare Workers | the storefront answered a request                               |

**Run the sweep now** triggers the delivery-update pass by hand. It is safe to press at any time,
even while the scheduled one is running: each stage is claimed in the database before anything is
sent, so nobody gets a duplicate email.

The page also probes the **stored logo** with the same decoder the spec sheets use, and names the
actual problem — an interlaced PNG, a progressive or CMYK JPEG, or an SVG, which looks perfect in a
browser preview and is not a raster image at all.

Check this page after any deploy, and first when something looks wrong.

## Troubleshooting

**A customer says they paid but nothing happened.**
Their order is probably in `pending_payment` because they closed the tab before returning. Find it
in `/admin/orders` (search their email), open it, press **Re-read from Stripe**, then confirm.

**"No Stripe payment intent on this order — sync it first" when refunding.**
Press **Re-read from Stripe** on the order, then refund.

**Amount mismatch on the confirmation panel.**
Stripe's total and the order total disagree. Do not confirm. Check the Stripe dashboard for a
partial capture, a different currency, or a manual amount change.

**No emails are arriving.**
`/admin/system` → Resend. Red usually means the API key was revoked; amber usually means the domain
verification lapsed. Individual send failures are recorded on each order's timeline with the
reason, so check there for a single customer.

**The cron shows "never run" or a stale timestamp.**
The Cloudflare Worker is not firing. Open the Worker's URL — it runs the sweep and shows the
result. A `401` means `CRON_SECRET` differs between the Worker and the API. Meanwhile, **Run the
sweep now** keeps customers updated.

**The storefront check is red but the site loads for you.**
The API could not reach the storefront. Check Cloudflare for an outage or a deploy in progress —
this check does not affect customers' ability to shop, only the report.

**"Access Denied" on /admin.**
The account is not an admin. Run `supabase/make-admin.sql` with that email in the Supabase SQL
editor.

**Revenue looks too low.**
Revenue counts confirmed payments only. Orders sitting in `awaiting_confirmation` are real money
that has not been counted yet — confirm them.
