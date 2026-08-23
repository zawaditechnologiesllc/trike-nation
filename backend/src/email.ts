import { env } from "./env";
import { BUFFER_EXPLANATION, deliveryWindowLabel } from "../../shared/core/delivery";
import { stageDefinition } from "../../shared/core/stages";
import { trackingLink } from "../../shared/core/couriers";

/**
 * Transactional email via Resend (https://resend.com/docs/api-reference).
 * Every customer-facing order event routes through here, so a missing
 * RESEND_API_KEY degrades to a loud log line rather than blocking checkout or
 * an admin status change.
 */

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const ref = (orderId: string, orderNumber?: string | null) =>
  orderNumber?.trim() ? orderNumber.trim() : `#${orderId.slice(0, 8).toUpperCase()}`;

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { replyTo?: string; tags?: Record<string, string> },
): Promise<SendResult> {
  if (!env.resendApiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`);
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.warn(`[email] invalid recipient "${to}" — skipped "${subject}"`);
    return { ok: false, error: "Invalid recipient address" };
  }
  try {
    const res = await fetch(`${env.resendApiBase}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [to],
        subject,
        html,
        reply_to: opts?.replyTo ?? env.emailReplyTo,
        ...(opts?.tags
          ? { tags: Object.entries(opts.tags).map(([name, value]) => ({ name, value })) }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend responded ${res.status}: ${body}`);
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.error("[email] send failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

/** Live check for the admin System page — does the API key actually work? */
export async function resendHealth(): Promise<{ ok: boolean; domains?: string[]; error?: string }> {
  if (!env.resendApiKey) return { ok: false, error: "RESEND_API_KEY is not set" };
  try {
    const res = await fetch(`${env.resendApiBase}/domains`, {
      headers: { Authorization: `Bearer ${env.resendApiKey}` },
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
    const data = (await res.json()) as { data?: { name: string; status?: string }[] };
    return {
      ok: true,
      domains: (data.data ?? []).map((d) => (d.status ? `${d.name} (${d.status})` : d.name)),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Resend unreachable" };
  }
}

// ---------------------------------------------------------------------------
// Branded shell
// ---------------------------------------------------------------------------

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function button(href: string, label: string): string {
  return `<p style="margin:24px 0">
    <a href="${href}" style="background:#b31d28;border:1px solid #ff3b45;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1px;padding:14px 28px;text-decoration:none;text-transform:uppercase">${escape(label)}</a>
  </p>`;
}

function shell(title: string, body: string): string {
  return `
<div style="background:#0f0f0f;color:#f5f5f7;font-family:Arial,Helvetica,sans-serif;padding:32px">
  <div style="max-width:560px;margin:0 auto;border:1px solid #333">
    <div style="background:#131313;border-bottom:2px solid #b31d28;padding:20px 24px">
      <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#ff3b45;text-transform:uppercase">${escape(env.brandName)}</span>
    </div>
    <div style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">${escape(title)}</h1>
      ${body}
    </div>
    <div style="background:#131313;border-top:1px solid #333;padding:16px 24px;font-size:11px;color:#8e8e93;line-height:1.7">
      ${escape(env.brandName.toUpperCase())} — ENGINEERED FOR ADRENALINE<br />
      Questions? <a href="mailto:${env.supportEmail}" style="color:#ff3b45;text-decoration:none">${env.supportEmail}</a>
      · <a href="${env.frontendUrl}" style="color:#ff3b45;text-decoration:none">${env.brandDomain}</a>
    </div>
  </div>
</div>`;
}

const p = (text: string) => `<p style="color:#c8c6c5;font-size:14px;line-height:1.7;margin:0 0 14px">${text}</p>`;
const muted = (text: string) => `<p style="color:#8e8e93;font-size:12px;line-height:1.7;margin:14px 0 0">${text}</p>`;

// ---------------------------------------------------------------------------
// Order summary table
// ---------------------------------------------------------------------------

export interface OrderEmailData {
  id: string;
  /** Human reference (GCG-2026-0148). Falls back to the short uuid. */
  orderNumber?: string | null;
  items: { name: string; qty: number; unitCents: number; color?: string | null }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode?: string | null;
  shippingCents?: number;
  countryCode?: string | null;
}

function orderTable(order: OrderEmailData): string {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #333">${escape(i.name)}${
          i.color ? ` <span style="color:#8e8e93">(${escape(i.color)})</span>` : ""
        } × ${i.qty}</td>
         <td style="padding:8px 0;border-bottom:1px solid #333;text-align:right">${money(i.unitCents * i.qty)}</td></tr>`,
    )
    .join("");
  const discount = order.discountCents
    ? `<tr><td style="padding:6px 0;color:#8e8e93">Discount${order.discountCode ? ` (${escape(order.discountCode)})` : ""}</td>
       <td style="padding:6px 0;text-align:right;color:#ff3b45">-${money(order.discountCents)}</td></tr>`
    : "";
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#f5f5f7">
    ${rows}
    <tr><td style="padding:6px 0;color:#8e8e93">Subtotal</td><td style="padding:6px 0;text-align:right">${money(order.subtotalCents)}</td></tr>
    ${discount}
    <tr><td style="padding:6px 0;color:#8e8e93">Shipping</td><td style="padding:6px 0;text-align:right;color:#4ade80">FREE</td></tr>
    <tr><td style="padding:10px 0;font-weight:bold;font-size:16px">Total</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;font-size:16px;color:#ff3b45">${money(order.totalCents)}</td></tr>
  </table>`;
}

const orderLink = (orderId: string) => `${env.frontendUrl}/orders/${orderId}`;

/**
 * One delivery window definition, shared with the storefront and the PDF. The
 * country widens it by transit zone — quoting the domestic window to a buyer
 * in Australia is how a shop generates "where is my order".
 */
const deliveryWindow = (countryCode?: string | null) => deliveryWindowLabel(countryCode);

// ---------------------------------------------------------------------------
// 1. Order placed — payment is with Stripe, confirmation is with a human
// ---------------------------------------------------------------------------

export function sendOrderReceived(to: string, order: OrderEmailData): Promise<SendResult> {
  return sendEmail(
    to,
    `We've got your order — ${ref(order.id, order.orderNumber)}`,
    shell(
      "Order received",
      p(
        `Thanks for the order. <strong>${ref(order.id, order.orderNumber)}</strong> is logged and your payment is being verified by our team — we confirm every payment by hand rather than trusting an automated flag, so this usually takes under one business day.`,
      ) +
        p("You'll get another email the moment it's confirmed, and again at every step after that.") +
        orderTable(order) +
        button(orderLink(order.id), "Track this order") +
        muted(`Delivery runs ${deliveryWindow()} from the day payment is confirmed.`),
    ),
    { tags: { type: "order_received" } },
  );
}

// ---------------------------------------------------------------------------
// 2. Payment confirmed by an admin
// ---------------------------------------------------------------------------

export function sendPaymentConfirmed(
  to: string,
  order: OrderEmailData,
  opts?: { accountSignupUrl?: string },
): Promise<SendResult> {
  const accountBlock = opts?.accountSignupUrl
    ? p(
        `You checked out as a guest. Create an account with <strong>${escape(to)}</strong> and this order — plus every future one — lands in your garage automatically.`,
      ) + button(opts.accountSignupUrl, "Create your account")
    : button(orderLink(order.id), "Track this order");

  return sendEmail(
    to,
    `Payment confirmed — ${ref(order.id, order.orderNumber)}`,
    shell(
      "Payment confirmed",
      p(
        `Payment for <strong>${ref(order.id, order.orderNumber)}</strong> is confirmed and your machine is in the build queue. Expect delivery in <strong>${deliveryWindow()}</strong>.`,
      ) +
        p(
          `We'll email you progress updates on day ${env.deliveryUpdateDays.join(", day ")} — and immediately whenever the status changes.`,
        ) +
        orderTable(order) +
        accountBlock,
    ),
    { tags: { type: "payment_confirmed" } },
  );
}

// ---------------------------------------------------------------------------
// 3. Every other status change
// ---------------------------------------------------------------------------

interface StatusCopy {
  subject: (orderRef: string) => string;
  title: string;
  body: (ctx: {
    orderRef: string;
    trackingNumber: string | null;
    courier: string | null;
    note: string | null;
  }) => string;
}

const STATUS_COPY: Record<string, StatusCopy> = {
  awaiting_confirmation: {
    subject: (r) => `Payment received, verifying — ${r}`,
    title: "Verifying your payment",
    body: ({ orderRef }) =>
      p(
        `You're back from Stripe and <strong>${orderRef}</strong> is queued for confirmation. A human on our side checks every payment — you'll hear from us within one business day.`,
      ),
  },
  paid: {
    subject: (r) => `Payment confirmed — ${r}`,
    title: "Payment confirmed",
    body: ({ orderRef }) =>
      p(`Payment for <strong>${orderRef}</strong> is confirmed. Your machine is in the build queue.`) +
      p(`Delivery window: <strong>${deliveryWindow()}</strong>.`),
  },
  processing: {
    subject: (r) => `In the build queue — ${r}`,
    title: "Your build has started",
    body: ({ orderRef }) =>
      p(
        `<strong>${orderRef}</strong> is on the bench. Frame prep, engine fitting, and the pre-ship shakedown happen before it crates.`,
      ) + p(`Still tracking to the ${deliveryWindow()} delivery window.`),
  },
  shipped: {
    subject: (r) => `Your order shipped — ${r}`,
    title: "It's on the way",
    body: ({ orderRef, trackingNumber, courier }) =>
      p(`<strong>${orderRef}</strong> left the Sacramento dock.`) +
      trackingBlock(courier, trackingNumber) +
      // Without this sentence a three-week estimate reads as a slow shop; with
      // it, it reads as a careful one and the buyer stops watching the calendar.
      p(BUFFER_EXPLANATION) +
      muted(
        "Freight deliveries: the carrier will call to schedule a window. Inspect the crate before signing.",
      ),
  },
  delivered: {
    subject: (r) => `Delivered — ${r}`,
    title: "Delivered",
    body: ({ orderRef }) =>
      p(`<strong>${orderRef}</strong> is marked delivered. Enjoy it.`) +
      p(
        `Before the first ride: check tire pressure, torque the axle nuts, add oil (engines ship dry), and take the first tank easy as break-in.`,
      ) +
      muted(`Something not right? Reply to this email or write to ${env.supportEmail}.`),
  },
  cancelled: {
    subject: (r) => `Order cancelled — ${r}`,
    title: "Order cancelled",
    body: ({ orderRef }) =>
      p(`<strong>${orderRef}</strong> has been cancelled.`) +
      p(
        `If a payment was taken it will be returned to your original payment method. Refunds usually clear in 5–10 business days.`,
      ),
  },
  refunded: {
    subject: (r) => `Refund issued — ${r}`,
    title: "Refund issued",
    body: ({ orderRef }) =>
      p(`A refund for <strong>${orderRef}</strong> has been issued to your original payment method.`) +
      p(
        `Refunds are processed by hand within ${env.refundDays} days. If the credit is not visible yet, that is almost always the bank rather than us — they typically take 5–10 business days to post it.`,
      ),
  },
  pending_payment: {
    subject: (r) => `Order reopened — ${r}`,
    title: "Payment still needed",
    body: ({ orderRef }) =>
      p(
        `<strong>${orderRef}</strong> is waiting on payment. If you meant to complete it, start the checkout again — nothing has been charged.`,
      ),
  },
};

export function statusEmailExists(status: string): boolean {
  return status in STATUS_COPY;
}

export function sendOrderStatusChanged(
  to: string,
  orderId: string,
  status: string,
  opts?: { trackingNumber?: string | null; courier?: string | null; note?: string | null },
): Promise<SendResult> {
  const copy = STATUS_COPY[status];
  const orderRef = ref(orderId);
  const note = opts?.note?.trim() ? opts.note.trim() : null;
  const noteBlock = note
    ? `<p style="border-left:3px solid #b31d28;color:#c8c6c5;font-size:14px;line-height:1.7;margin:0 0 14px;padding-left:12px">${escape(note)}</p>`
    : "";

  if (!copy) {
    return sendEmail(
      to,
      `Order update — ${orderRef}`,
      shell(
        "Order update",
        p(`<strong>${orderRef}</strong> is now <strong>${escape(status.replace(/_/g, " "))}</strong>.`) +
          noteBlock +
          button(orderLink(orderId), "View your order"),
      ),
      { tags: { type: "status_change", status } },
    );
  }

  return sendEmail(
    to,
    copy.subject(orderRef),
    shell(
      copy.title,
      copy.body({
        orderRef,
        trackingNumber: opts?.trackingNumber ?? null,
        courier: opts?.courier ?? null,
        note,
      }) +
        noteBlock +
        button(orderLink(orderId), "View your order"),
    ),
    { tags: { type: "status_change", status } },
  );
}

// ---------------------------------------------------------------------------
// 4. Delivery progress — the cron milestones (day 7 / 12 / 20)
// ---------------------------------------------------------------------------

/**
 * A tracking number is only ever rendered as a LINK when the courier has a
 * known URL and the number is not one we generated ourselves — a link that
 * lands on "not found" makes the customer think nothing shipped.
 */
function trackingBlock(courier: string | null | undefined, tracking: string | null | undefined): string {
  if (!tracking) return "";
  const link = trackingLink(courier, tracking);
  const value = link.url
    ? `<a href="${link.url}" style="color:#ff3b45;text-decoration:none">${escape(tracking)}</a>`
    : `<strong style="color:#ff3b45">${escape(tracking)}</strong>`;
  return `<p style="font-size:14px;color:#f5f5f7;margin:0 0 14px">Tracking number: ${value}</p>`;
}

export function sendDeliveryUpdate(
  to: string,
  orderId: string,
  stageKey: string,
  opts?: {
    trackingNumber?: string | null;
    courier?: string | null;
    countryCode?: string | null;
    items?: { name: string; qty: number; color?: string | null }[];
  },
): Promise<SendResult> {
  const orderRef = ref(orderId);
  const stage = stageDefinition(stageKey);
  const title = stage?.title ?? "Delivery progress";
  const body = stage?.body ?? "Your order is moving through the pipeline.";

  // Every stage email is about THIS order: the itemised list, not a generic
  // "your order is on its way".
  const items = (opts?.items ?? [])
    .map((i) => `<li style="margin:0 0 6px">${escape(i.name)}${i.color ? ` — ${escape(i.color)}` : ""} × ${i.qty}</li>`)
    .join("");
  const itemList = items
    ? `<ul style="color:#c8c6c5;font-size:14px;line-height:1.7;margin:0 0 14px;padding-left:18px">${items}</ul>`
    : "";

  return sendEmail(
    to,
    `${title} — ${orderRef}`,
    shell(
      title,
      p(`An update on <strong>${orderRef}</strong>.`) +
        p(body) +
        itemList +
        trackingBlock(opts?.courier, opts?.trackingNumber) +
        button(orderLink(orderId), "View your order") +
        muted(
          `Full delivery window: ${deliveryWindow(opts?.countryCode)} from confirmed payment. ${BUFFER_EXPLANATION}`,
        ),
    ),
    { tags: { type: "delivery_update", stage: stageKey } },
  );
}

/**
 * Order placed but never paid. This is NOT a confirmation — sending one for an
 * unpaid order teaches customers that "confirmed" means nothing. It is an
 * abandoned-cart email: what they chose, and a link that puts it back.
 */
export function sendAbandonedCart(
  to: string,
  order: OrderEmailData,
  opts: { resumeUrl: string; reminderNumber: number },
): Promise<SendResult> {
  const first = opts.reminderNumber <= 1;
  return sendEmail(
    to,
    first ? `You left something in your cart` : `Still thinking it over?`,
    shell(
      first ? "Your build is still staged" : "Your build is still here",
      p(
        first
          ? "You got as far as checkout and the payment did not complete — nothing has been charged. Here is what you had staged:"
          : "This is still sitting in your cart. No pressure, and nothing has been charged:",
      ) +
        orderTable(order) +
        button(opts.resumeUrl, "Put this back in my cart") +
        muted(
          `If you have changed your mind, ignore this — we will stop after a couple more. Questions? ${env.supportEmail}.`,
        ),
    ),
    { tags: { type: "abandoned_cart", reminder: String(opts.reminderNumber) } },
  );
}

// ---------------------------------------------------------------------------
// 5. Guest → account invite
// ---------------------------------------------------------------------------

export function sendAccountInvite(to: string, signupUrl: string, orderId?: string): Promise<SendResult> {
  return sendEmail(
    to,
    orderId ? `Create your account to track ${ref(orderId)}` : `Create your ${env.brandName} account`,
    shell(
      "Claim your order",
      p(
        orderId
          ? `Order <strong>${ref(orderId)}</strong> is confirmed and tied to <strong>${escape(to)}</strong>.`
          : `Your order is tied to <strong>${escape(to)}</strong>.`,
      ) +
        p(
          `Create an account with that same email address and the order attaches to it automatically — order history, live status, and tracking, all in one place.`,
        ) +
        button(signupUrl, "Create your account") +
        muted("Use the same email address you ordered with — that's how we match it up."),
    ),
    { tags: { type: "account_invite" } },
  );
}

// ---------------------------------------------------------------------------
// 6. Admin + marketing
// ---------------------------------------------------------------------------

export function sendAdminNewOrder(order: OrderEmailData & { email: string }): Promise<SendResult> {
  if (!env.adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — new-order notification skipped");
    return Promise.resolve({ ok: false, error: "ADMIN_EMAIL is not configured" });
  }
  return sendEmail(
    env.adminEmail,
    `Order awaiting confirmation — ${ref(order.id, order.orderNumber)} (${money(order.totalCents)})`,
    shell(
      "New order to confirm",
      p(`<strong>${escape(order.email)}</strong> placed order <strong>${ref(order.id, order.orderNumber)}</strong>.`) +
        orderTable(order) +
        button(`${env.frontendUrl}/admin/orders/${order.id}`, "Review and confirm") +
        muted("Payments are confirmed manually — the customer is waiting on this."),
    ),
    { tags: { type: "admin_new_order" } },
  );
}

export function sendNewsletterWelcome(to: string): Promise<SendResult> {
  return sendEmail(
    to,
    "Welcome to the Crew",
    shell(
      "You're in",
      p(
        "Expect exclusive drops, racing events, pre-orders, and technical build guides — straight to your garage. Ride hard.",
      ),
    ),
    { tags: { type: "newsletter_welcome" } },
  );
}

export function sendContactNotification(msg: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<SendResult> {
  if (!env.adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — contact notification skipped");
    return Promise.resolve({ ok: false, error: "ADMIN_EMAIL is not configured" });
  }
  return sendEmail(
    env.adminEmail,
    `New contact message: ${msg.subject || "(no subject)"}`,
    shell(
      "New message from the storefront",
      `<p style="font-size:14px;margin:0 0 14px"><strong>${escape(msg.name)}</strong> &lt;${escape(msg.email)}&gt;</p>
       <p style="color:#c8c6c5;font-size:14px;line-height:1.7;white-space:pre-wrap;margin:0 0 14px">${escape(msg.message)}</p>` +
        muted("Reply directly to this rider, and mark the message handled in the admin panel."),
    ),
    { replyTo: msg.email, tags: { type: "contact" } },
  );
}
