import type { OrderTimelineEntry } from "@/lib/types";
import { orderStatusLabel } from "./OrderStatusBadge";

const ICON: Record<string, string> = {
  payment_confirmed: "✓",
  delivery_update: "◷",
  account_linked: "◈",
  status_change: "▸",
};

/** Reverse-chronological history of everything that happened to an order. */
export default function OrderTimeline({ entries }: { entries: OrderTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="font-mono text-xs text-silver">No updates yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {entries.map((entry, i) => (
        <li key={`${entry.at}-${i}`} className="flex gap-4">
          <span className="mt-0.5 font-mono text-xs text-ember">{ICON[entry.type] ?? "▸"}</span>
          <div className="min-w-0">
            <p className="text-sm text-chrome">{entry.message}</p>
            <p className="mt-1 font-mono text-xs text-silver">
              {new Date(entry.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              {entry.status ? ` · ${orderStatusLabel(entry.status)}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
