import { money } from "@/lib/format";

export default function Price({
  priceCents,
  compareAtCents,
  size = "md",
}: {
  priceCents: number;
  compareAtCents?: number;
  size?: "md" | "lg";
}) {
  return (
    <span className={`font-mono font-bold ${size === "lg" ? "text-3xl" : "text-lg"}`}>
      {compareAtCents && compareAtCents > priceCents && (
        <span className="mr-2 text-silver line-through">{money(compareAtCents)}</span>
      )}
      <span className="text-ember">{money(priceCents)}</span>
    </span>
  );
}
