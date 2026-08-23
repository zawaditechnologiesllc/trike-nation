"use client";

import { useState } from "react";
import type { ProductColorOption } from "@/lib/types";

/**
 * Amazon-style colour swatches.
 *
 * Four details here are load-bearing, and each was a visible bug before:
 *
 *  1. The label FOLLOWS THE POINTER. Hovering a tile names it before you
 *     commit; keyboard focus drives it too. Without that, choosing a colour
 *     means clicking one to find out what it was.
 *  2. The tile is the border and the swatch sits INSIDE with a gap. That gap
 *     is what makes a selected tile read as selected — a ring drawn onto the
 *     colour just looks like an edge of the colour.
 *  3. Every swatch carries an inset hairline, or a near-black colour on a dark
 *     card is an invisible button.
 *  4. The first colour is selected from the moment the page loads, and
 *     add-to-cart is never blocked on choosing one: every unit has a colour
 *     whether or not the buyer thought about it, and stopping checkout over it
 *     costs sales. It is not labelled "optional" either — a selected default
 *     needs no explanation.
 */
export default function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: ProductColorOption[];
  value: string | null;
  onChange: (name: string) => void;
}) {
  // What the pointer is over, which is not the same as what is selected.
  const [preview, setPreview] = useState<string | null>(null);

  if (colors.length === 0) return null;
  const shown = preview ?? value ?? colors[0]?.name ?? null;

  return (
    <div className="mt-6">
      <p className="label-caps text-on-surface-muted">
        Colour: <span className="text-on-surface">{shown}</span>
      </p>

      <div
        className="mt-3 flex flex-wrap gap-2"
        onMouseLeave={() => setPreview(null)}
        role="radiogroup"
        aria-label="Colour"
      >
        {colors.map((color) => {
          const selected = color.name === value;
          return (
            <button
              key={color.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.name}
              title={color.name}
              onClick={() => onChange(color.name)}
              onMouseEnter={() => setPreview(color.name)}
              onFocus={() => setPreview(color.name)}
              onBlur={() => setPreview(null)}
              className={`flex h-12 w-12 items-center justify-center border-2 transition-colors ${
                selected
                  ? "border-secondary"
                  : "border-outline-variant hover:border-on-surface-variant"
              }`}
            >
              {color.hex ? (
                <span
                  className="block h-full w-full"
                  style={{
                    backgroundColor: color.hex,
                    // The inset hairline: without it a near-black swatch on a
                    // dark card is an invisible button.
                    boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.22)",
                  }}
                />
              ) : (
                // No hex in the sheet → show the name, never a blank tile and
                // never a guessed colour.
                <span className="px-1 text-center font-mono text-[9px] leading-tight text-on-surface-variant">
                  {color.name.split(/\s+/).slice(0, 2).join(" ")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
