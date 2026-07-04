import { env } from "../env";

/**
 * PayPal Business integration via the Orders v2 REST API:
 *   1. POST /api/orders (provider "paypal") creates the order row, then a
 *      PayPal order whose custom_id carries our order id; the customer is
 *      redirected to the returned approval URL.
 *   2. PayPal returns the customer to /checkout/paypal/return?order=<id>&token=<paypalOrderId>.
 *   3. That page calls POST /api/payments/paypal/capture, which captures the
 *      funds server-side, marks the order paid, and emails the receipt.
 *
 * Setup: create a REST app in the PayPal developer dashboard (Business
 * account), then set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and
 * PAYPAL_ENV=live (defaults to sandbox).
 */

export function paypalEnabled(): boolean {
  return Boolean(env.paypalClientId && env.paypalClientSecret);
}

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString("base64");
  const res = await fetch(`${env.paypalApiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createPaypalOrder(
  orderId: string,
  totalCents: number,
): Promise<{ redirectUrl: string; paypalOrderId: string }> {
  if (!paypalEnabled()) throw new Error("PayPal is not configured");
  const token = await getAccessToken();
  const res = await fetch(`${env.paypalApiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: orderId,
          amount: { currency_code: "USD", value: (totalCents / 100).toFixed(2) },
          description: `Trike Nation order #${orderId.slice(0, 8).toUpperCase()}`,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Trike Nation",
            user_action: "PAY_NOW",
            return_url: `${env.frontendUrl}/checkout/paypal/return?order=${orderId}`,
            cancel_url: `${env.frontendUrl}/checkout?cancelled=1`,
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal order create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; links: { rel: string; href: string }[] };
  const approve = data.links.find((l) => l.rel === "payer-action") ?? data.links.find((l) => l.rel === "approve");
  if (!approve) throw new Error("PayPal did not return an approval link");
  return { redirectUrl: approve.href, paypalOrderId: data.id };
}

export async function capturePaypalOrder(
  paypalOrderId: string,
): Promise<{ completed: boolean; customId: string | null; captureId: string | null }> {
  if (!paypalEnabled()) throw new Error("PayPal is not configured");
  const token = await getAccessToken();
  const res = await fetch(`${env.paypalApiBase}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    status: string;
    purchase_units?: {
      custom_id?: string;
      payments?: { captures?: { id: string; custom_id?: string }[] };
    }[];
  };
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    completed: data.status === "COMPLETED",
    customId: capture?.custom_id ?? unit?.custom_id ?? null,
    captureId: capture?.id ?? null,
  };
}
