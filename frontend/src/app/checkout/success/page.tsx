"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { money } from "@/lib/format";

function SuccessContent() {
  const params = useSearchParams();
  const id = params.get("id") ?? "—";
  const total = Number(params.get("total") ?? 0);
  const demo = params.get("demo") === "1";

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center md:px-12">
      <p className="display glow-red mx-auto flex h-16 w-16 items-center justify-center bg-crimson text-3xl text-offwhite">
        ✓
      </p>
      <h1 className="display mt-8 text-4xl md:text-6xl">
        Order <span className="text-ember">Confirmed</span>
      </h1>
      <p className="mt-6 text-silver">
        Your machine is being prepped in the garage. A confirmation email is on its way.
      </p>

      <dl className="mx-auto mt-10 max-w-md space-y-3 border border-steel bg-carbon p-8 text-left">
        <div className="spec-row">
          <dt className="label-caps text-silver">Order ID</dt>
          <span className="spec-leader" />
          <dd className="font-mono text-sm font-bold">{id}</dd>
        </div>
        {total > 0 && (
          <div className="spec-row">
            <dt className="label-caps text-silver">Total Charged</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-sm font-bold text-ember">{money(total)}</dd>
          </div>
        )}
        <div className="spec-row">
          <dt className="label-caps text-silver">Shipping</dt>
          <span className="spec-leader" />
          <dd className="font-mono text-sm font-bold text-success">FREE · WORLDWIDE</dd>
        </div>
      </dl>

      {demo && (
        <p className="mx-auto mt-6 max-w-md border border-dashed border-steel-light p-4 font-mono text-xs text-silver">
          Demo mode: the backend API is not configured, so this order was simulated locally and not
          stored. Set NEXT_PUBLIC_API_URL to enable real orders.
        </p>
      )}

      <div className="mt-10 flex justify-center gap-4">
        <Link href="/shop" className="display glow-red bg-crimson px-8 py-3 text-offwhite hover:bg-ember">
          Keep Shopping
        </Link>
        <Link
          href="/account"
          className="display border-2 border-chrome px-8 py-3 text-chrome hover:border-ember hover:text-ember"
        >
          View Account
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
