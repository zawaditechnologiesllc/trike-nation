import { env } from "./env";

/**
 * Transactional email via Resend (https://resend.com/docs/api-reference).
 * When RESEND_API_KEY is unset, sends are skipped with a loud log line so
 * order processing never blocks on email configuration.
 */

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!env.resendApiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch(`${env.resendApiBase}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] Resend responded ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

const shell = (title: string, body: string) => `
<div style="background:#0f0f0f;color:#f5f5f7;font-family:Arial,Helvetica,sans-serif;padding:32px">
  <div style="max-width:560px;margin:0 auto;border:1px solid #333">
    <div style="background:#131313;border-bottom:2px solid #b31d28;padding:20px 24px">
      <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#ff3b45;text-transform:uppercase">Trike Nation</span>
    </div>
    <div style="padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px;text-transform:uppercase;letter-spacing:1px">${title}</h1>
      ${body}
    </div>
    <div style="background:#131313;border-top:1px solid #333;padding:16px 24px;font-size:11px;color:#8e8e93">
      TRIKE NATION — ENGINEERED FOR ADRENALINE
    </div>
  </div>
</div>`;

interface OrderEmailData {
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
        `<tr><td style="padding:8px 0;border-bottom:1px solid #333">${i.name} × ${i.qty}</td>
         <td style="padding:8px 0;border-bottom:1px solid #333;text-align:right">${money(i.unitCents * i.qty)}</td></tr>`,
    )
    .join("");
  const discount = order.discountCents
    ? `<tr><td style="padding:6px 0;color:#8e8e93">Discount${order.discountCode ? ` (${order.discountCode})` : ""}</td>
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

export function sendOrderConfirmation(to: string, order: OrderEmailData): Promise<boolean> {
  return sendEmail(
    to,
    `Order confirmed — #${order.id.slice(0, 8).toUpperCase()}`,
    shell(
      "Your machine is being prepped",
      `<p style="color:#c8c6c5;font-size:14px">Payment received. Order <strong>#${order.id
        .slice(0, 8)
        .toUpperCase()}</strong> is now in the build queue — we'll email you when it ships.</p>
      ${orderTable(order)}`,
    ),
  );
}

export function sendOrderShipped(to: string, orderId: string, trackingNumber: string | null): Promise<boolean> {
  return sendEmail(
    to,
    `Your order shipped — #${orderId.slice(0, 8).toUpperCase()}`,
    shell(
      "It's on the way",
      `<p style="color:#c8c6c5;font-size:14px">Order <strong>#${orderId.slice(0, 8).toUpperCase()}</strong> left the Sacramento dock.</p>
      ${
        trackingNumber
          ? `<p style="font-size:14px;color:#f5f5f7">Tracking number: <strong style="color:#ff3b45">${trackingNumber}</strong></p>`
          : ""
      }
      <p style="color:#8e8e93;font-size:12px">Freight deliveries: the carrier will call to schedule a window. Inspect the crate before signing.</p>`,
    ),
  );
}

export function sendNewsletterWelcome(to: string): Promise<boolean> {
  return sendEmail(
    to,
    "Welcome to the Nation",
    shell(
      "You're in",
      `<p style="color:#c8c6c5;font-size:14px">Expect exclusive drops, racing events, pre-orders, and technical build guides — straight to your garage. Ride hard.</p>`,
    ),
  );
}

export function sendContactNotification(msg: { name: string; email: string; subject: string; message: string }): Promise<boolean> {
  if (!env.adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — contact notification skipped");
    return Promise.resolve(false);
  }
  return sendEmail(
    env.adminEmail,
    `New contact message: ${msg.subject || "(no subject)"}`,
    shell(
      "New message from the storefront",
      `<p style="font-size:14px"><strong>${msg.name}</strong> &lt;${msg.email}&gt;</p>
       <p style="color:#c8c6c5;font-size:14px;white-space:pre-wrap">${msg.message}</p>
       <p style="color:#8e8e93;font-size:12px">Reply directly to this rider, and mark the message handled in the admin panel.</p>`,
    ),
  );
}
