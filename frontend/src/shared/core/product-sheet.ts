/**
 * Bulk import from a plain-text product sheet.
 *
 * The owner writes these by hand, so the parser has to survive real
 * formatting rather than a schema: fields in any order, headings with or
 * without colons, prices with currency symbols and commas, and colours in the
 * three shapes colors.ts already handles.
 *
 * Products are separated by a line of dashes or a blank line before a new
 * "Name:" — whichever the sheet happens to use.
 */

import { parseColors, stripColorLines, type ProductColor } from "./colors";

export interface ParsedProduct {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  category: string;
  engineSize: string;
  /**
   * Kept as the admin wrote them, unit and all ("48 in", "120 cm"). Parsing to
   * a number means picking a unit for a bare "48", and a spec sheet that
   * confidently states the wrong size is worse than one that repeats the
   * seller's own words.
   */
  width: string | null;
  length: string | null;
  colors: ProductColor[];
  specs: { label: string; value: string }[];
  boxContents: string[];
  badge: string | null;
  inStock: boolean;
  /** Anything the parser could not place, so the admin can see what it missed. */
  warnings: string[];
}

export interface SheetParseResult {
  products: ParsedProduct[];
  /** Blocks that produced nothing usable, with the reason. */
  rejected: { block: string; reason: string }[];
}

const FIELD_ALIASES: Record<string, string> = {
  name: "name", product: "name", title: "name",
  slug: "slug", handle: "slug",
  tagline: "tagline", subtitle: "tagline", blurb: "tagline",
  price: "price", cost: "price", "sale price": "price",
  "compare at": "compareAt", "was": "compareAt", "rrp": "compareAt", "list price": "compareAt",
  category: "category", type: "category",
  engine: "engine", "engine size": "engine", cc: "engine",
  width: "width", "overall width": "width",
  length: "length", "overall length": "length",
  dimensions: "dimensions", size: "dimensions", "overall size": "dimensions",
  badge: "badge", label: "badge",
  stock: "stock", availability: "stock", "in stock": "stock",
  description: "description", details: "description", about: "description",
  "in the box": "box", "box contents": "box", includes: "box", "whats included": "box",
  specs: "specs", specifications: "specs",
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'“”‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "$1,299.00" / "1299" / "£1.299,00" → cents. Returns null for junk. */
export function parseMoneyToCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^-/.test(text)) return null;
  // Keep digits and separators, then decide which separator is the decimal.
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;

  // Which separator is the decimal point? Position alone is not enough:
  // "1,299.00" and "1.299,00" are both 1299, but so is "1,200" — where the
  // comma is a THOUSANDS separator, not a decimal.
  //
  // The tell is how many digits follow the last separator: exactly three
  // means thousands, one or two means decimal. Getting this wrong prices a
  // $1,200 machine at $1.20.
  const lastSeparator = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  let normalised: string;
  if (lastSeparator === -1) {
    normalised = cleaned;
  } else {
    const trailingDigits = cleaned.length - lastSeparator - 1;
    if (trailingDigits === 3) {
      // Thousands grouping all the way down: strip every separator.
      normalised = cleaned.replace(/[.,]/g, "");
    } else {
      const whole = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
      const fraction = cleaned.slice(lastSeparator + 1);
      normalised = `${whole}.${fraction}`;
    }
  }
  const value = Number(normalised);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Tidies one dimension as written: "  48in " → "48 in". Junk becomes null. */
export function normaliseDimension(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).trim().replace(/\s+/g, " ");
  if (!text || !/\d/.test(text)) return null;
  // "48in" reads as a typo on a spec sheet; put the space back without
  // touching the unit the seller chose.
  return text.replace(/(\d)\s*(mm|cm|m|in|inch|inches|ft|feet|")/gi, "$1 $2").trim();
}

/**
 * A combined line: "Dimensions: 60 x 34 x 28 in".
 *
 * The near-universal listing convention is length × width × height, so the
 * first number is the length and the second the width. That IS an assumption,
 * and a swapped pair is a customer ordering something that will not fit
 * through a door — so the caller raises a warning naming what was read, and
 * the admin sees it in the import preview before anything is saved.
 */
export function splitDimensions(raw: string | null | undefined): { length: string | null; width: string | null } {
  if (!raw) return { length: null, width: null };
  const text = String(raw).trim();
  // The trailing unit usually applies to every number: "60 x 34 in".
  const unit = text.match(/(mm|cm|m|in|inch|inches|ft|feet|")\s*$/i)?.[1] ?? "";
  const parts = text.split(/\s*[x×*]\s*/i).filter((part) => /\d/.test(part));
  if (parts.length < 2) return { length: null, width: null };
  const withUnit = (part: string): string | null => {
    const own = normaliseDimension(part);
    if (!own) return null;
    return /[a-z"]/i.test(own) || !unit ? own : normaliseDimension(`${own} ${unit}`);
  };
  return { length: withUnit(parts[0]), width: withUnit(parts[1]) };
}

function splitBlocks(sheet: string): string[] {
  const normalised = sheet.replace(/\r\n/g, "\n");
  // A run of dashes/equals on its own line is the usual separator.
  const byRule = normalised.split(/\n\s*[-=_]{3,}\s*\n/);
  if (byRule.length > 1) return byRule.map((b) => b.trim()).filter(Boolean);
  // Otherwise start a new block whenever a "Name:" line appears.
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of normalised.split("\n")) {
    if (/^\s*(name|product|title)\s*:/i.test(line) && current.some((l) => l.trim())) {
      blocks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim())) blocks.push(current.join("\n").trim());
  return blocks.filter(Boolean);
}

function fieldFor(label: string): string | undefined {
  return FIELD_ALIASES[label.trim().toLowerCase().replace(/[^a-z ]/g, "")];
}

function parseBlock(block: string): ParsedProduct | { reason: string } {
  const lines = block.split("\n");
  const values: Record<string, string> = {};
  const listValues: Record<string, string[]> = {};
  const loose: string[] = [];

  let currentField: string | null = null;
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z '/]{1,24})\s*:\s*(.*)$/);
    const field = match ? fieldFor(match[1]) : undefined;

    if (field) {
      currentField = field;
      const inline = match![2].trim();
      if (inline) values[field] = values[field] ? `${values[field]}\n${inline}` : inline;
      continue;
    }
    // A bullet under the last heading belongs to it.
    if (currentField && /^\s*[-*•]/.test(line)) {
      (listValues[currentField] ??= []).push(line.replace(/^\s*[-*•]\s*/, "").trim());
      continue;
    }
    if (currentField && line.trim() && !match) {
      values[currentField] = values[currentField] ? `${values[currentField]}\n${line.trim()}` : line.trim();
      continue;
    }
    if (line.trim()) loose.push(line.trim());
  }

  const name = (values.name ?? loose[0] ?? "").trim();
  if (!name) return { reason: "No product name found in this block." };

  const priceCents = parseMoneyToCents(values.price);
  if (priceCents === null) {
    return { reason: `"${name}" has no readable price — add a line like "Price: $1,299".` };
  }

  const warnings: string[] = [];
  if (!values.category) warnings.push("No category given; it will import as uncategorised.");

  // Colours can appear anywhere in the block, in any of the three shapes.
  const colors = parseColors(block);

  const descriptionRaw = values.description ?? loose.slice(1).join("\n");
  const description = colors.length ? stripColorLines(descriptionRaw) : descriptionRaw;

  const specs = (listValues.specs ?? [])
    .map((entry) => {
      const [label, ...rest] = entry.split(/[:=]/);
      return { label: label.trim(), value: rest.join(":").trim() };
    })
    .filter((s) => s.label && s.value);

  const stockText = (values.stock ?? "").toLowerCase();
  const inStock = stockText ? !/(out|none|0|no)\b/.test(stockText) : true;

  // An explicit "Width:" always beats a number inferred from a combined line.
  const combined = splitDimensions(values.dimensions);
  const width = normaliseDimension(values.width) ?? combined.width;
  const length = normaliseDimension(values.length) ?? combined.length;
  if (values.dimensions && !values.width && !values.length && (combined.width || combined.length)) {
    warnings.push(
      `Read "${values.dimensions.trim()}" as length ${combined.length ?? "?"} by width ${combined.width ?? "?"}. ` +
        `Write "Length:" and "Width:" on their own lines if that is the wrong way round.`,
    );
  }
  if (values.dimensions && !combined.width && !combined.length && !width && !length) {
    warnings.push(`Could not read a width or length from "${values.dimensions.trim()}".`);
  }

  return {
    name,
    slug: slugify(values.slug || name),
    tagline: values.tagline ?? "",
    description: description.trim(),
    priceCents,
    compareAtCents: parseMoneyToCents(values.compareAt),
    category: (values.category ?? "").trim().toLowerCase().replace(/\s+/g, "-"),
    engineSize: (values.engine ?? "N/A").trim().toUpperCase(),
    width,
    length,
    colors,
    specs,
    boxContents: listValues.box ?? [],
    badge: values.badge?.trim() || null,
    inStock,
    warnings,
  };
}

export function parseProductSheet(sheet: string): SheetParseResult {
  const products: ParsedProduct[] = [];
  const rejected: { block: string; reason: string }[] = [];

  for (const block of splitBlocks(sheet)) {
    const parsed = parseBlock(block);
    if ("reason" in parsed) {
      rejected.push({ block: block.slice(0, 120), reason: parsed.reason });
    } else {
      products.push(parsed);
    }
  }

  return { products, rejected };
}
