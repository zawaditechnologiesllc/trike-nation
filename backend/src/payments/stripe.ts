import Stripe from "stripe";
import { env } from "../env";
import type { PricedItem } from "../pricing";

/**
 * Stripe is the only payment provider, and it is wired **without webhooks** —
 * Stripe's event delivery has been unreliable for us, so nothing here is
 * allowed to flip an order to paid on its own:
 *
 *   1. POST /api/orders creates the order row, then a hosted Checkout Session
 *      whose metadata carries our order id.
 *   2. The customer pays on Stripe's hosted page and returns to
 *      /checkout/success?order=<id>&session_id=<cs_…>.
 *   3. The backend *pulls* the session with retrieveCheckoutSession (a plain
 *      API read, no webhook, no signature) and records what Stripe reports on
 *      the order: payment status, amount, payment intent, receipt URL.
 *   4. An admin reviews that in /admin/orders/<id> and confirms the payment by
 *      hand. Only that action marks the order paid and emails the customer.
 *
 * Setup: STRIPE_SECRET_KEY is all that is required. There is no
 * STRIPE_WEBHOOK_SECRET and no webhook endpoint to register.
 */

/** stripe-node exports its config type from a submodule, not the namespace. */
type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;

function buildClient(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  const config: StripeConfig = {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: `${env.brandName} Storefront`, url: env.frontendUrl },
  };
  if (env.stripeApiBase) {
    const url = new URL(env.stripeApiBase);
    return new Stripe(env.stripeSecretKey, {
      ...config,
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      protocol: url.protocol.replace(":", "") as "http" | "https",
    });
  }
  return new Stripe(env.stripeSecretKey, config);
}

export const stripe = buildClient();

export function stripeEnabled(): boolean {
  return Boolean(stripe);
}

/** True for `sk_live_…` keys, so the admin System page can flag test mode. */
export function stripeLiveMode(): boolean {
  return Boolean(env.stripeSecretKey?.startsWith("sk_live_"));
}

export interface CheckoutShipping {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
}

export async function createStripeCheckout(input: {
  orderId: string;
  email: string;
  items: PricedItem[];
  discountCents: number;
  discountCode?: string | null;
  shipping?: CheckoutShipping;
}): Promise<{ redirectUrl: string; sessionId: string }> {
  if (!stripe) throw new Error("Stripe is not configured");
  const { orderId, email, items, discountCents, discountCode, shipping } = input;
  const reference = orderId.slice(0, 8).toUpperCase();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer_email: email,
    client_reference_id: orderId,
    line_items: items.map((item) => ({
      quantity: item.qty,
      price_data: {
        currency: env.stripeCurrency,
        unit_amount: item.unitCents,
        product_data: {
          name: item.name,
          metadata: { slug: item.slug, ...(item.productId ? { product_id: item.productId } : {}) },
        },
      },
    })),
    metadata: {
      order_id: orderId,
      order_reference: reference,
      brand: env.brandName,
      ...(discountCode ? { discount_code: discountCode } : {}),
    },
    payment_intent_data: {
      description: `${env.brandName} order #${reference}`,
      metadata: { order_id: orderId, order_reference: reference },
      ...(shipping
        ? {
            shipping: {
              name: `${shipping.firstName} ${shipping.lastName}`.trim(),
              phone: shipping.phone,
              address: { line1: shipping.address, city: shipping.city, postal_code: shipping.zip },
            },
          }
        : {}),
    },
    // The customer lands back with the session id so the backend can pull the
    // real payment state from Stripe instead of waiting on a webhook.
    success_url: `${env.frontendUrl}/checkout/success?order=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.frontendUrl}/checkout?cancelled=1&order=${orderId}`,
    // Give the buyer a real window, and let expired sessions be re-checked.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 23,
  };

  if (discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: env.stripeCurrency,
      duration: "once",
      name: discountCode ?? "Discount",
      metadata: { order_id: orderId },
    });
    params.discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout:${orderId}` });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { redirectUrl: session.url, sessionId: session.id };
}

export interface StripeSessionSnapshot {
  sessionId: string;
  /** Stripe's own view: "paid" | "unpaid" | "no_payment_required". */
  paymentStatus: string;
  /** Session lifecycle: "open" | "complete" | "expired". */
  sessionStatus: string;
  amountTotalCents: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  customerEmail: string | null;
  orderId: string | null;
}

/**
 * Reads the current state of a Checkout Session straight from Stripe. This is
 * a pull, not a push — it is what replaces webhook delivery. It never mutates
 * an order; callers store the snapshot for an admin to review.
 */
export async function retrieveCheckoutSession(sessionId: string): Promise<StripeSessionSnapshot> {
  if (!stripe) throw new Error("Stripe is not configured");
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent", "payment_intent.latest_charge"],
  });

  const intent =
    session.payment_intent && typeof session.payment_intent !== "string" ? session.payment_intent : null;
  const charge =
    intent?.latest_charge && typeof intent.latest_charge !== "string" ? intent.latest_charge : null;

  return {
    sessionId: session.id,
    paymentStatus: session.payment_status ?? "unpaid",
    sessionStatus: session.status ?? "open",
    amountTotalCents: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentIntentId: intent?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
    chargeId: charge?.id ?? null,
    receiptUrl: charge?.receipt_url ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    orderId: session.metadata?.order_id ?? session.client_reference_id ?? null,
  };
}

/** Refunds a payment intent (admin action from the order detail page). */
export async function refundPayment(
  paymentIntentId: string,
  amountCents?: number,
): Promise<{ id: string; status: string | null; amountCents: number }> {
  if (!stripe) throw new Error("Stripe is not configured");
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amountCents ? { amount: amountCents } : {}),
  });
  return { id: refund.id, status: refund.status, amountCents: refund.amount };
}

/** Live account probe used by the admin System page. */
export async function stripeAccountSnapshot(): Promise<{
  ok: boolean;
  accountId?: string;
  businessName?: string | null;
  chargesEnabled?: boolean;
  livemode: boolean;
  error?: string;
}> {
  if (!stripe) return { ok: false, livemode: false, error: "STRIPE_SECRET_KEY is not set" };
  try {
    const account = await stripe.accounts.retrieve(null);
    return {
      ok: true,
      accountId: account.id,
      businessName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
      chargesEnabled: account.charges_enabled,
      livemode: stripeLiveMode(),
    };
  } catch (err) {
    return { ok: false, livemode: stripeLiveMode(), error: err instanceof Error ? err.message : "Stripe error" };
  }
}
