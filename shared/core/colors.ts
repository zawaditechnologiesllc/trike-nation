/**
 * Product colour parsing.
 *
 * Real product sheets write colours three different ways, and a parser that
 * only handles one leaves colours sitting in the database with nothing willing
 * to render them. All three are supported here:
 *
 *   1. Colors: Midnight Black #101010, Voltage Blue #1e5bff, Hazard Lime
 *   2. COLOURS                          (heading alone, items on their own lines)
 *      - Midnight Black
 *      - Voltage Blue
 *   3. - Available in Red, Black, White, Blue, and Purple    (a SENTENCE, mid-list)
 *
 * ONE list of headings lives here and is shared by the sheet importer and the
 * description reader. When those two keep their own copies they drift, and a
 * sheet saying "Colour Options:" imports perfectly then shows no swatches.
 */

export interface ProductColor {
  name: string;
  /** Lower-case #rrggbb, or null when the sheet gave no hex. */
  hex: string | null;
}

/**
 * Every heading that introduces a colour list. Both spellings, plus the
 * synonyms real sheets actually use. Adding one here fixes the importer AND
 * the description reader at once — that is the point of the shared list.
 */
export const COLOR_HEADINGS = [
  "colors",
  "colours",
  "color",
  "colour",
  "available colors",
  "available colours",
  "colors available",
  "colours available",
  "color options",
  "colour options",
  "color choices",
  "colour choices",
  "colorways",
  "colourways",
  "frame colors",
  "frame colours",
  "finish",
  "finishes",
  "shades",
] as const;

/** Phrases that can introduce a colour list inside a sentence. */
const SENTENCE_LEADS = ["available in", "comes in", "offered in", "choose from", "supplied in"];

/**
 * Words that make a token plausibly a colour. The sentence form needs at least
 * one, or "Available in 48V, 60V and 72V" renders voltages as swatches.
 */
const COLOR_WORDS = [
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple", "violet",
  "pink", "grey", "gray", "silver", "gold", "bronze", "copper", "chrome", "brass",
  "brown", "tan", "beige", "cream", "ivory", "charcoal", "graphite", "slate",
  "teal", "turquoise", "cyan", "magenta", "lime", "olive", "navy", "maroon",
  "burgundy", "crimson", "scarlet", "amber", "sand", "stone", "carbon", "midnight",
  "matte", "matt", "gloss", "satin", "metallic", "pearl", "camo", "camouflage",
  "raw", "clear", "smoke", "sunset", "aqua", "mint", "lavender", "rose", "coral",
];

/** Looks like a measurement rather than a colour: 48V, 200cc, 12", 3.5mm. */
const MEASUREMENT = /^[\d.,]+\s*(v|cc|kw|w|mm|cm|m|in|inch|inches|"|'|kg|lb|lbs|ah|mph|kph|hp|nm|psi)?$/i;

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i;

function normaliseHex(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(HEX);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return `#${hex}`;
}

function looksLikeColorWord(text: string): boolean {
  const lower = text.toLowerCase();
  return COLOR_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(lower));
}

function stripLeadingConjunction(text: string): string {
  // "and Purple" → "Purple". Without this, the Oxford comma yields a colour
  // literally called "and Purple".
  return text.replace(/^\s*(?:and|or|&)\s+/i, "").trim();
}

function cleanName(raw: string): string {
  return stripLeadingConjunction(
    raw
      .replace(HEX, "")
      .replace(/[()[\]{}]/g, " ")
      .replace(/^[\s\-–—*•·]+|[\s\-–—*•·.,;:]+$/g, "")
      .replace(/\s+/g, " "),
  ).trim();
}

/** One entry: "Midnight Black #101010" / "#101010 Midnight Black" / "Lime (#0f0)". */
function parseEntry(raw: string): ProductColor | null {
  const hex = normaliseHex(raw);
  const name = cleanName(raw);
  if (!name) return null;
  if (MEASUREMENT.test(name)) return null;
  return { name, hex };
}

function splitEntries(raw: string): string[] {
  return raw
    .split(/[,;\n]|(?:\s+\/\s+)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupe(colors: ProductColor[]): ProductColor[] {
  const seen = new Map<string, ProductColor>();
  for (const color of colors) {
    const key = color.name.toLowerCase();
    const existing = seen.get(key);
    // A later entry that carries a hex wins over an earlier one that does not.
    if (!existing || (!existing.hex && color.hex)) seen.set(key, color);
  }
  return [...seen.values()];
}

function headingPattern(): RegExp {
  const alternatives = [...COLOR_HEADINGS]
    .sort((a, b) => b.length - a.length) // longest first: "available colors" before "colors"
    .map((h) => h.replace(/\s+/g, "\\s+"));
  return new RegExp(`^\\s*[-*•]?\\s*(?:${alternatives.join("|")})\\s*[:\\-–—]?\\s*(.*)$`, "i");
}

/**
 * Form 3: a sentence. Guarded hard, because a false positive renders a
 * sentence fragment as a swatch on the live shop.
 *
 * Requires: one of the lead phrases, at least two items, no item that looks
 * like a measurement, and at least one item containing a real colour word.
 * So "Available in 48V, 60V and 72V" and "Available in the UK, Europe and
 * North America" both correctly yield nothing.
 */
export function colorsFromSentence(line: string): ProductColor[] {
  const lower = line.toLowerCase();
  const lead = SENTENCE_LEADS.find((phrase) => lower.includes(phrase));
  if (!lead) return [];

  const after = line.slice(lower.indexOf(lead) + lead.length);
  const tail = after.split(/[.!?]/)[0] ?? "";
  const entries = splitEntries(tail)
    .flatMap((part) => part.split(/\s+\band\b\s+|\s+\bor\b\s+/i))
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed = entries
    .map(parseEntry)
    .filter((color): color is ProductColor => color !== null)
    // "the UK" → drop articles that survive the split
    .filter((color) => !/^(?:the|a|an)$/i.test(color.name));

  if (parsed.length < 2) return [];
  if (parsed.some((color) => MEASUREMENT.test(color.name))) return [];
  if (!parsed.some((color) => looksLikeColorWord(color.name))) return [];
  return dedupe(parsed);
}

/**
 * Parses colours out of any block of text — a product sheet or a description.
 * Handles all three forms; returns [] rather than guessing.
 */
export function parseColors(text: string | null | undefined): ProductColor[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const heading = headingPattern();
  const found: ProductColor[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(heading);

    if (match) {
      const inline = match[1]?.trim() ?? "";
      if (inline) {
        // Form 1: "Colors: A #hex, B, C"
        found.push(
          ...splitEntries(inline)
            .map(parseEntry)
            .filter((c): c is ProductColor => c !== null),
        );
      } else {
        // Form 2: heading alone, items on the following lines until a blank
        // line or the next heading.
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j];
          if (!next.trim()) break;
          if (/^\s*[A-Z][A-Za-z ]{2,}\s*:/.test(next) && !next.match(heading)) break;
          if (!/^\s*[-*•]/.test(next) && found.length > 0) break;
          const entry = parseEntry(next);
          if (entry) found.push(entry);
        }
      }
      continue;
    }

    // Form 3: a sentence anywhere, including mid-bullet-list.
    found.push(...colorsFromSentence(line));
  }

  return dedupe(found);
}

/**
 * Removes the lines the colour parser consumed, so a description is not shown
 * with "Colors: Viper Red #b31d28, …" sitting above the swatches that render
 * exactly that. Uses the SAME heading list and sentence detection, so a line
 * can never be stripped from the text without appearing as a swatch, or vice
 * versa.
 */
export function stripColorLines(text: string | null | undefined): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const heading = headingPattern();
  const keep: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(heading);
    if (match) {
      if (!match[1]?.trim()) {
        // Heading alone: skip its item lines too.
        while (i + 1 < lines.length && lines[i + 1].trim() && /^\s*[-*•]/.test(lines[i + 1])) i++;
      }
      continue;
    }
    if (colorsFromSentence(line).length > 0) continue;
    keep.push(line);
  }

  return keep.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Convenience for products uploaded before the colors column existed. */
export function colorsFromDescription(description: string | null | undefined): ProductColor[] {
  return parseColors(description);
}

/**
 * The colour applied when a line arrives without one — a stale cart, a
 * non-browser request. Every unit has a colour whether or not the buyer
 * thought about it.
 */
export function defaultColor(colors: ProductColor[]): string | null {
  return colors[0]?.name ?? null;
}

/**
 * Server-side check. Returns the colour to store, or null when the product
 * has no colours at all. Throws for a colour the product does not come in:
 * quietly substituting one would put a colour on the order the buyer
 * explicitly did not ask for.
 */
export function resolveColor(colors: ProductColor[], requested: string | null | undefined): string | null {
  if (colors.length === 0) return null;
  if (!requested) return defaultColor(colors);
  const match = colors.find((c) => c.name.toLowerCase() === requested.trim().toLowerCase());
  if (!match) {
    throw new Error(
      `"${requested}" is not a colour this product comes in. Available: ${colors.map((c) => c.name).join(", ")}.`,
    );
  }
  return match.name;
}
