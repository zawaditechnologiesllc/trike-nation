const TONE: Record<string, string> = {
  paid: "border-success/50 text-success",
  delivered: "border-success/50 text-success",
  processing: "border-blush/50 text-blush",
  shipped: "border-blush/50 text-blush",
  awaiting_confirmation: "border-amber/50 text-amber",
  pending_payment: "border-steel-light text-silver",
  cancelled: "border-ember/50 text-ember",
  refunded: "border-ember/50 text-ember",
};

const LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  awaiting_confirmation: "Verifying payment",
  paid: "Payment confirmed",
  processing: "In the build queue",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Customer-facing order status chip — shared by the account, order, and success pages. */
export default function OrderStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`label-caps inline-block border px-2 py-1 ${TONE[status] ?? "border-steel-light text-silver"} ${className}`}
    >
      {LABEL[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function orderStatusLabel(status: string): string {
  return LABEL[status] ?? status.replace(/_/g, " ");
}
