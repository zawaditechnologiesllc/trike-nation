"use client";

import type { AdminOrderDetail } from "@/lib/admin";

/**
 * Fraud review, advisory only.
 *
 * Three rules this panel is built around:
 *  - It NEVER recommends refusing an order. A corporate VPN, a privacy-minded
 *    customer, an expat and a traveller all trip these signals. Card fraud is
 *    stopped at the payment layer, where issuing-country checks, CVC, postcode
 *    and 3DS liability shift actually live — all dashboard settings.
 *  - It shows no badge unless something is genuinely worth a look, so the
 *    badges keep meaning something.
 *  - Every flag is explained in plain English, because the person reading it
 *    is a shop owner, not a fraud analyst.
 *
 * Note what is absent: the IP address. Most sensitive field, least useful for
 * review, and so never stored.
 */
const TONE: Record<string, string> = {
  clear: "text-signal-positive",
  note: "text-on-surface-muted",
  review: "text-signal-orange",
  high: "text-error",
};

const HEADLINE: Record<string, string> = {
  clear: "Nothing unusual about this connection",
  note: "Worth knowing, nothing to act on",
  review: "Worth a look before shipping",
  high: "Check this one carefully before shipping",
};

export default function RiskPanel({ order }: { order: AdminOrderDetail }) {
  const level = order.risk_level ?? "clear";
  const flags = order.risk_flags ?? [];
  const shipTo = (order.shipping?.country as string | undefined) ?? "";

  return (
    <div className="border border-outline bg-surface-container p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="display text-xl">Order origin</h2>
        <span className={`label-caps ${TONE[level] ?? "text-on-surface-muted"}`}>{HEADLINE[level] ?? level}</span>
      </div>

      <dl className="mt-4 space-y-2">
        {[
          ["Connected from", [order.origin_city, order.origin_region, order.origin_country].filter(Boolean).join(", ") || "unknown"],
          ["Network", order.origin_network ?? "unknown"],
          ["Browser timezone", order.origin_timezone ?? "not reported"],
          ["Ships to", shipTo || "—"],
        ].map(([label, value]) => (
          <div key={label} className="spec-row">
            <dt className="label-caps text-on-surface-muted">{label}</dt>
            <span className="spec-leader" />
            <dd className="font-mono text-xs text-on-surface-variant">{value}</dd>
          </div>
        ))}
      </dl>

      {flags.length > 0 && (
        <ul className="mt-5 space-y-4 border-t border-outline/60 pt-5">
          {flags.map((flag) => (
            <li key={flag.code}>
              <p className="label-caps text-on-secondary-fixed">{flag.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{flag.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 border-t border-outline/60 pt-4 font-mono text-xs leading-relaxed text-on-surface-muted">
        These are advisory only — never a reason to refuse an order on their own. Card fraud is
        stopped in Stripe: issuing-country mismatch, CVC and postcode checks, and 3DS liability
        shift are all settings in the Stripe dashboard. No IP address is stored for this order.
      </p>
    </div>
  );
}
