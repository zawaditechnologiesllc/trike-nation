"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { capturePaypal } from "@/lib/api";

/**
 * PayPal sends the buyer back here after approval with ?order=<ours>&token=<paypal order id>.
 * We capture the funds server-side, then hand off to the shared success page.
 */
function PaypalReturnContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const orderId = params.get("order") ?? "";
    const paypalOrderId = params.get("token") ?? "";
    if (!orderId || !paypalOrderId) {
      setError("Missing payment reference. If you were charged, contact support with your PayPal receipt.");
      return;
    }
    capturePaypal(orderId, paypalOrderId)
      .then(() => router.replace(`/checkout/success?order=${orderId}`))
      .catch((err) => setError(err instanceof Error ? err.message : "PayPal capture failed."));
  }, [params, router]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-32 text-center md:px-12">
      {error ? (
        <>
          <h1 className="display text-4xl">
            Payment <span className="text-ember">Problem</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md font-mono text-sm text-silver">{error}</p>
          <Link
            href="/checkout"
            className="display glow-red mt-10 inline-block bg-crimson px-8 py-3 text-offwhite hover:bg-ember"
          >
            Back to Checkout
          </Link>
        </>
      ) : (
        <>
          <h1 className="display text-4xl">
            Finalizing <span className="text-ember">PayPal…</span>
          </h1>
          <p className="label-caps mt-6 text-silver">Capturing payment — don&apos;t close this tab.</p>
        </>
      )}
    </div>
  );
}

export default function PaypalReturnPage() {
  return (
    <Suspense>
      <PaypalReturnContent />
    </Suspense>
  );
}
