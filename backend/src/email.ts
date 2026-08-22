import { env } from "./env";

/**
 * Transactional email via Resend (https://resend.com/docs/api-reference).
 * Every customer-facing order event routes through here, so a missing
 * RESEND_API_KEY degrades to a loud log line rather than blocking checkout or
 * an admin status change.
 */

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const ref = (orderId: string) => `#${orderId.slice(0, 8).toUpperCase()}`;

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
  items: { name: string; qty: number; unitCents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode?: string | null;
}

function orderTable(order: OrderEmailData): string {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #333">${escape(i.name)} × ${i.qty}</td>
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
const deliveryWindow = () => `${env.deliveryMinDays}–${env.deliveryMaxDays} days`;

// ---------------------------------------------------------------------------
// 1. Order placed — payment is with Stripe, confirmation is with a human
// ---------------------------------------------------------------------------

export function sendOrderReceived(to: string, order: OrderEmailData): Promise<SendResult> {
  return sendEmail(
    to,
    `We've got your order — ${ref(order.id)}`,
    shell(
      "Order received",
      p(
        `Thanks for the order. <strong>${ref(order.id)}</strong> is logged and your payment is being verified by our team — we confirm every payment by hand rather than trusting an automated flag, so this usually takes under one business day.`,
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
    `Payment confirmed — ${ref(order.id)}`,
    shell(
      "Payment confirmed",
      p(
        `Payment for <strong>${ref(order.id)}</strong> is confirmed and your machine is in the build queue. Expect delivery in <strong>${deliveryWindow()}</strong>.`,
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
  body: (ctx: { orderRef: string; trackingNumber: string | null; note: string | null }) => string;
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
    body: ({ orderRef, trackingNumber }) =>
      p(`<strong>${orderRef}</strong> left the Sacramento dock.`) +
      (trackingNumber
        ? `<p style="font-size:14px;color:#f5f5f7;margin:0 0 14px">Tracking number: <strong style="color:#ff3b45">${escape(trackingNumber)}</strong></p>`
        : "") +
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
      p(`Banks typically take 5–10 business days to post it.`),
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
  opts?: { trackingNumber?: string | null; note?: string | null },
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
      copy.body({ orderRef, trackingNumber: opts?.trackingNumber ?? null, note }) +
        noteBlock +
        button(orderLink(orderId), "View your order"),
    ),
    { tags: { type: "status_change", status } },
  );
}

// ---------------------------------------------------------------------------
// 4. Delivery progress — the cron milestones (day 7 / 12 / 20)
// ---------------------------------------------------------------------------

const DELIVERY_STAGE: Record<number, { title: string; body: string }> = {
  7: {
    title: "Week one: your build is underway",
    body: "Your machine has cleared frame prep and is being assembled. Nothing needed from you — this is just us keeping you in the loop.",
  },
  12: {
    title: "Assembled and heading for the crate",
    body: "Assembly and the pre-ship shakedown are done or close to it. Next stop is crating and the freight handoff.",
  },
  20: {
    title: "In transit — final stretch",
    body: "Your crate is with the carrier and moving. If it has already landed, ignore this — and if the tracking looks stuck, tell us and we'll chase it.",
  },
};

export function sendDeliveryUpdate(
  to: string,
  orderId: string,
  dayNumber: number,
  opts?: { trackingNumber?: string | null; status?: string },
): Promise<SendResult> {
  const orderRef = ref(orderId);
  const stage = DELIVERY_STAGE[dayNumber] ?? {
    title: "Delivery progress",
    body: "Your order is moving through the pipeline.",
  };
  return sendEmail(
    to,
    `Day ${dayNumber} update — ${orderRef}`,
    shell(
      stage.title,
      p(`Day ${dayNumber} since we confirmed payment on <strong>${orderRef}</strong>.`) +
        p(stage.body) +
        (opts?.trackingNumber
          ? `<p style="font-size:14px;color:#f5f5f7;margin:0 0 14px">Tracking number: <strong style="color:#ff3b45">${escape(opts.trackingNumber)}</strong></p>`
          : "") +
        button(orderLink(orderId), "View your order") +
        muted(`Full delivery window: ${deliveryWindow()} from confirmed payment.`),
    ),
    { tags: { type: "delivery_update", day: String(dayNumber) } },
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
    `Order awaiting confirmation — ${ref(order.id)} (${money(order.totalCents)})`,
    shell(
      "New order to confirm",
      p(`<strong>${escape(order.email)}</strong> placed order <strong>${ref(order.id)}</strong>.`) +
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
