/**
 * A PDF writer, from scratch.
 *
 * No library: this is a few hundred lines and it removes a dependency from a
 * path that runs on every product page. Standard-14 fonts only, so no font
 * program has to be embedded.
 *
 * Two bugs this file is shaped to avoid:
 *
 *  1. Character folding must be IDEMPOTENT. Fold twice and an en dash must not
 *     vanish — it becomes "-", and folding "-" again must leave "-".
 *  2. A page break returns the NEW cursor rather than mutating a captured one.
 *     The classic version of this bug is a helper that updates a variable the
 *     caller already holds by value, so text keeps drawing below the footer on
 *     the page it just left.
 */

// --- WinAnsi folding --------------------------------------------------------

/**
 * Characters outside WinAnsi, mapped to something a Standard-14 font can draw.
 * Applied repeatedly without changing the result after the first pass.
 */
const FOLD: [RegExp, string][] = [
  [/[–—]/g, "-"],       // en dash, em dash
  [/[‘’‛]/g, "'"], // curly single quotes
  [/[“”‟]/g, '"'], // curly double quotes
  [/…/g, "..."],
  [/ /g, " "],
  [/[•●▪]/g, "-"], // bullets
  [/™/g, "(TM)"],
  [/®/g, "(R)"],
  [/[≤]/g, "<="],
  [/[≥]/g, ">="],
  [/×/g, "x"],
  [/[′″]/g, "'"],
];

/** Idempotent: fold(fold(x)) === fold(x) for every input. */
export function foldToWinAnsi(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FOLD) out = out.replace(pattern, replacement);
  // Anything still outside printable WinAnsi is dropped rather than drawn as
  // a wrong glyph.
  return out.replace(/[^\x20-\x7E\xA1-\xFF]/g, "");
}

/** Escapes the three characters that terminate a PDF string literal. */
function escapeString(text: string): string {
  return foldToWinAnsi(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// --- Standard-14 metrics ----------------------------------------------------

/**
 * Helvetica advance widths, in 1/1000 em. Enough to wrap text without
 * embedding a font program; every unlisted character uses the average.
 */
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278,
  "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500,
  d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222,
  m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556,
  v: 500, w: 722, x: 500, y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584,
};

const AVERAGE_WIDTH = 556;
const BOLD_FACTOR = 1.06;

export function textWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const char of foldToWinAnsi(text)) total += HELVETICA_WIDTHS[char] ?? AVERAGE_WIDTH;
  return (total / 1000) * size * (bold ? BOLD_FACTOR : 1);
}

/** Greedy word wrap. Long unbreakable tokens are hard-split rather than clipped. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of foldToWinAnsi(text).split(/\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (textWidth(word, size, bold) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (textWidth(chunk + char, size, bold) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// --- Document ---------------------------------------------------------------

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const CONTENT_WIDTH = A4.width - MARGIN * 2;
const FOOTER_Y = 52;

export interface PdfColor {
  r: number;
  g: number;
  b: number;
}

export const rgb = (hex: string): PdfColor => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
};

interface PageContent {
  ops: string[];
}

export class PdfDocument {
  private pages: PageContent[] = [];
  private current: PageContent;
  /** Image XObjects, keyed by the name used in the content stream. */
  private images = new Map<string, { data: Uint8Array; width: number; height: number }>();
  private watermarkName: string | null = null;
  private watermarkText: string | null = null;

  constructor() {
    this.current = { ops: [] };
    this.pages.push(this.current);
  }

  /**
   * Starts a new page and RETURNS the fresh cursor. Callers must use the
   * returned value — this is deliberately not a mutation of anything they
   * already hold.
   */
  newPage(): number {
    this.current = { ops: [] };
    this.pages.push(this.current);
    return A4.height - MARGIN;
  }

  /**
   * Ensures `needed` points fit above the footer, breaking if not.
   * ALWAYS use the return value:  y = doc.ensureSpace(y, 40)
   */
  ensureSpace(y: number, needed: number): number {
    if (y - needed < FOOTER_Y + 24) return this.newPage();
    return y;
  }

  private op(line: string): void {
    this.current.ops.push(line);
  }

  setFill(color: PdfColor): void {
    this.op(`${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`);
  }

  /** Draws one line of text. Returns the cursor after it. */
  text(
    value: string,
    y: number,
    opts: { size?: number; bold?: boolean; color?: PdfColor; x?: number; leading?: number } = {},
  ): number {
    const size = opts.size ?? 10;
    const font = opts.bold ? "/F2" : "/F1";
    const x = opts.x ?? MARGIN;
    if (opts.color) this.setFill(opts.color);
    this.op(`BT ${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapeString(value)}) Tj ET`);
    return y - (opts.leading ?? size * 1.45);
  }

  /** Wrapped paragraph. Breaks pages as needed and returns the final cursor. */
  paragraph(
    value: string,
    y: number,
    opts: { size?: number; bold?: boolean; color?: PdfColor; width?: number; x?: number } = {},
  ): number {
    const size = opts.size ?? 10;
    const width = opts.width ?? CONTENT_WIDTH;
    let cursor = y;
    for (const line of wrapText(value, size, width, opts.bold)) {
      cursor = this.ensureSpace(cursor, size * 1.6);
      cursor = this.text(line, cursor, { ...opts, size });
    }
    return cursor;
  }

  rule(y: number, color: PdfColor, thickness = 0.75): number {
    this.op(
      `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG ${thickness} w ` +
        `${MARGIN} ${y.toFixed(2)} m ${(A4.width - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`,
    );
    return y - 14;
  }

  rect(x: number, y: number, width: number, height: number, color: PdfColor): void {
    this.setFill(color);
    this.op(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  /** Registers a decoded raster image and draws it. */
  drawImage(name: string, image: { data: Uint8Array; width: number; height: number }, x: number, y: number, w: number, h: number): void {
    this.images.set(name, image);
    this.op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`);
  }

  /** Low-opacity logo behind the content, or a text fallback. */
  setWatermark(image: { data: Uint8Array; width: number; height: number } | null, fallbackText: string): void {
    if (image) {
      this.images.set("WM", image);
      this.watermarkName = "WM";
    } else {
      this.watermarkText = fallbackText;
    }
  }

  private watermarkOps(): string[] {
    if (this.watermarkName) {
      const size = 320;
      return [
        "q /GSwm gs",
        `${size} 0 0 ${size} ${((A4.width - size) / 2).toFixed(2)} ${((A4.height - size) / 2).toFixed(2)} cm /${this.watermarkName} Do`,
        "Q",
      ];
    }
    if (this.watermarkText) {
      const size = 46;
      const width = textWidth(this.watermarkText, size, true);
      return [
        "q /GSwm gs 0.6 0.6 0.6 rg",
        `BT /F2 ${size} Tf ${((A4.width - width) / 2).toFixed(2)} ${(A4.height / 2).toFixed(2)} Td (${escapeString(this.watermarkText)}) Tj ET`,
        "Q",
      ];
    }
    return [];
  }

  footer(left: string, right: string): void {
    // Applied to every page at serialise time, so a page added later still
    // gets one.
    this.footerLeft = left;
    this.footerRight = right;
  }

  private footerLeft = "";
  private footerRight = "";

  private footerOps(pageNumber: number, pageCount: number): string[] {
    const size = 8;
    const right = `${this.footerRight}  ${pageNumber}/${pageCount}`;
    return [
      "0.45 0.45 0.45 rg",
      `BT /F1 ${size} Tf ${MARGIN} ${FOOTER_Y} Td (${escapeString(this.footerLeft)}) Tj ET`,
      `BT /F1 ${size} Tf ${(A4.width - MARGIN - textWidth(right, size)).toFixed(2)} ${FOOTER_Y} Td (${escapeString(right)}) Tj ET`,
    ];
  }

  /** Serialises to PDF bytes. */
  build(): Uint8Array {
    const objects: string[] = [];
    const binaryObjects = new Map<number, Uint8Array>();
    const push = (body: string): number => {
      objects.push(body);
      return objects.length; // 1-indexed object numbers
    };

    const fontRegular = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    // ExtGState for the watermark's constant alpha.
    const gsWatermark = push("<< /Type /ExtGState /ca 0.06 /CA 0.06 >>");

    const imageRefs = new Map<string, number>();
    for (const [name, image] of this.images) {
      const number = push(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.data.length} >>`,
      );
      binaryObjects.set(number, image.data);
      imageRefs.set(name, number);
    }

    const pagesObjectNumber = objects.length + this.pages.length * 2 + 1;
    const pageNumbers: number[] = [];

    this.pages.forEach((page, index) => {
      const stream = [...this.watermarkOps(), ...page.ops, ...this.footerOps(index + 1, this.pages.length)].join("\n");
      const contentNumber = push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
      const xobjects = [...imageRefs.entries()].map(([name, number]) => `/${name} ${number} 0 R`).join(" ");
      const pageNumber = push(
        `<< /Type /Page /Parent ${pagesObjectNumber} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> ` +
          `/ExtGState << /GSwm ${gsWatermark} 0 R >>` +
          (xobjects ? ` /XObject << ${xobjects} >>` : "") +
          ` >> /Contents ${contentNumber} 0 R >>`,
      );
      pageNumbers.push(pageNumber);
    });

    const pagesNumber = push(
      `<< /Type /Pages /Count ${pageNumbers.length} /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] >>`,
    );
    const catalogNumber = push(`<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`);

    // Assemble, tracking byte offsets for the xref table.
    const chunks: Buffer[] = [];
    let offset = 0;
    const offsets: number[] = [];
    const write = (text: string | Buffer) => {
      const buffer = typeof text === "string" ? Buffer.from(text, "latin1") : text;
      chunks.push(buffer);
      offset += buffer.length;
    };

    write("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    objects.forEach((body, index) => {
      const number = index + 1;
      offsets[number] = offset;
      const binary = binaryObjects.get(number);
      if (binary) {
        write(`${number} 0 obj\n${body}\nstream\n`);
        write(Buffer.from(binary));
        write("\nendstream\nendobj\n");
      } else {
        write(`${number} 0 obj\n${body}\nendobj\n`);
      }
    });

    const xrefOffset = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let number = 1; number <= objects.length; number++) {
      xref += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
    }
    write(xref);
    write(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return new Uint8Array(Buffer.concat(chunks));
  }
}

export const PAGE = { A4, MARGIN, CONTENT_WIDTH, FOOTER_Y };
