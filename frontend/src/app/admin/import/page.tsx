"use client";

import Link from "next/link";
import { useState } from "react";
import { adminFetch } from "@/lib/admin";

interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  created: string[];
  updated: string[];
  failed: { slug: string; reason: string }[];
  rejected: { block: string; reason: string }[];
  warnings: string[];
  summary: string;
}

const EXAMPLE = `Name: "Viper" Special Edition TGV Mini Trike
Price: $1,100.00
Was: $1,200
Category: mini-trikes
Engine: 200cc
Length: 60 in
Width: 34 in
Badge: SALE
Tagline: Custom Build • Worldwide Ship
Description: The Viper Special Edition is engineered for the adrenaline seeker.
Colors: Viper Red #b31d28, Midnight Black #101010
In the box:
- Fully Assembled Viper
- 2x Replacement Sleeves
Specs:
- Top Speed: 45 MPH
- Frame: Reinforced TIG-Welded Steel

------------------------

Product: 212cc Monster Minibike
Price: 650
Category: mini-bikes
Engine: 212CC
Dimensions: 52 x 29 in
Details: Raw power in a compact frame.
- Available in Red, Black and Blue`;

export default function ImportPage() {
  const [sheet, setSheet] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "import");
    setError("");
    setResult(null);
    try {
      setResult(await adminFetch<ImportResult>("/products/import", {
        method: "POST",
        body: JSON.stringify({ sheet, dryRun }),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">Bulk Import</h1>
      <p className="mt-1 font-mono text-xs text-on-surface-muted">
        Paste a product sheet. Fields can be in any order, and colours can be written any of the
        three usual ways. Preview first — it tells you exactly what would happen without saving.
      </p>
      <p className="mt-3 font-mono text-xs text-on-surface-muted">
        <span className="text-on-secondary-fixed">Length</span> and{" "}
        <span className="text-on-secondary-fixed">Width</span> are printed on the product
        spec PDF, so write them with the unit — <code>Length: 60 in</code>. A single{" "}
        <code>Dimensions: 60 x 34 in</code> line works too and is read as length by width;
        the preview tells you which way round it was read.
      </p>

      <textarea
        value={sheet}
        onChange={(e) => setSheet(e.target.value)}
        rows={18}
        spellCheck={false}
        placeholder={EXAMPLE}
        className="input-tech mt-6 resize-y font-mono text-xs"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => run(true)}
          disabled={Boolean(busy) || !sheet.trim()}
          className="label-caps border border-outline-variant px-5 py-2.5 text-on-surface-variant hover:border-secondary hover:text-secondary disabled:opacity-40"
        >
          {busy === "preview" ? "Checking…" : "Preview (saves nothing)"}
        </button>
        <button
          onClick={() => run(false)}
          disabled={Boolean(busy) || !sheet.trim()}
          className="display glow-red bg-primary px-6 py-2.5 text-on-primary hover:bg-secondary disabled:opacity-50"
        >
          {busy === "import" ? "Importing…" : "Import"}
        </button>
        <button
          onClick={() => setSheet(EXAMPLE)}
          className="label-caps text-on-surface-muted hover:text-secondary"
        >
          Load an example
        </button>
      </div>

      {error && <p className="mt-6 font-mono text-sm text-error">{error}</p>}

      {result && (
        <div className="mt-8 space-y-4">
          <p className={`border p-4 font-mono text-sm ${result.ok ? "border-signal-positive/50 text-signal-positive" : "border-error/50 text-error"}`}>
            {result.summary}
          </p>

          {result.created.length > 0 && (
            <Section title={result.dryRun ? "Would create" : "Created"} tone="text-signal-positive" items={result.created} />
          )}
          {result.updated.length > 0 && <Section title="Updated" tone="text-on-secondary-fixed" items={result.updated} />}
          {result.warnings.length > 0 && <Section title="Warnings" tone="text-signal-orange" items={result.warnings} />}
          {result.failed.length > 0 && (
            <Section title="Failed" tone="text-error" items={result.failed.map((f) => `${f.slug}: ${f.reason}`)} />
          )}
          {result.rejected.length > 0 && (
            <Section
              title="Skipped blocks"
              tone="text-signal-orange"
              items={result.rejected.map((r) => `${r.reason}  —  “${r.block}…”`)}
            />
          )}

          {!result.dryRun && result.created.length + result.updated.length > 0 && (
            <Link href="/admin/products" className="label-caps inline-block text-secondary hover:text-on-secondary-fixed">
              View products →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className="border border-outline bg-surface-container p-5">
      <p className={`label-caps ${tone}`}>
        {title} ({items.length})
      </p>
      <ul className="mt-3 space-y-1 font-mono text-xs text-on-surface-variant">
        {items.map((item) => (
          <li key={item}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}
