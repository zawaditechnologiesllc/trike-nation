import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";
import Badge from "./Badge";
import Price from "./Price";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block border border-steel bg-carbon transition-colors hover:border-crimson"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          {product.badges.map((badge) => (
            <Badge key={badge} tone={badge === "SALE" || badge === "BLACK FRIDAY" ? "red" : "steel"}>
              {badge}
            </Badge>
          ))}
        </div>
      </div>
      <div className="border-t border-steel p-4">
        <h3 className="display text-xl leading-tight text-offwhite group-hover:text-blush">{product.name}</h3>
        <div className="mt-2">
          <Price priceCents={product.priceCents} compareAtCents={product.compareAtCents} />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-steel pt-3">
          <span className="label-caps text-silver">{product.blurb}</span>
          <span className="display bg-crimson px-3 py-1.5 text-xs text-offwhite opacity-90 transition-opacity group-hover:opacity-100">
            Shop Now
          </span>
        </div>
      </div>
    </Link>
  );
}
