import Stripe from "stripe";
import { env } from "../env";
import type { PricedItem } from "../pricing";

/**
 * Stripe integration via hosted Checkout Sessions:
 *   1. POST /api/orders (provider "stripe") creates the order row, then a
 *      Checkout Session whose metadata carries our order id.
 *   2. The customer pays on Stripe's hosted page and returns to
 *      /checkout/success?order=<id>.
 *   3. Stripe calls POST /api/webhooks/stripe (checkout.session.completed);
 *      we verify the signature, mark the order paid, and email the receipt.
 *
 * Setup: set STRIPE_SECRET_KEY, then create a webhook endpoint in the Stripe
 * dashboard pointing at <API_URL>/api/webhooks/stripe with the
 * checkout.session.completed + checkout.session.expired events, and set
 * STRIPE_WEBHOOK_SECRET to its signing secret.
 */

function buildClient(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  if (env.stripeApiBase) {
    const url = new URL(env.stripeApiBase);
    return new Stripe(env.stripeSecretKey, {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      protocol: url.protocol.replace(":", "") as "http" | "https",
    });
  }
  return new Stripe(env.stripeSecretKey);
}

export const stripe = buildClient();

export async function createStripeCheckout(
  orderId: string,
  email: string,
  items: PricedItem[],
  discountCents: number,
  discountCode?: string | null,
): Promise<{ redirectUrl: string; sessionId: string }> {
  if (!stripe) throw new Error("Stripe is not configured");

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer_email: email,
    line_items: items.map((item) => ({
      quantity: item.qty,
      price_data: {
        currency: "usd",
        unit_amount: item.unitCents,
        product_data: { name: item.name },
      },
    })),
    metadata: { order_id: orderId },
    payment_intent_data: { metadata: { order_id: orderId } },
    success_url: `${env.frontendUrl}/checkout/success?order=${orderId}`,
    cancel_url: `${env.frontendUrl}/checkout?cancelled=1`,
  };

  if (discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: "usd",
      duration: "once",
      name: discountCode ?? "Discount",
    });
    params.discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { redirectUrl: session.url, sessionId: session.id };
}

export function verifyStripeWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  if (!stripe) throw new Error("Stripe is not configured");
  if (!env.stripeWebhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}
