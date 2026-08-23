import { fetchProduct, fetchSettings } from "@/lib/api";
import { PdfDocument, PAGE, rgb } from "@/shared/core/pdf";
import { colorsFromDescription, stripColorLines } from "@/shared/core/colors";
import { deliveryWindowLabel } from "@/shared/core/delivery";
import { BRAND, EMAILS } from "@/lib/brand";

/**
 * A4 product spec sheet, generated on demand.
 *
 * Cached for a day rather than regenerated per request: the content only
 * changes when an admin edits the product, and the generator is cheap but not
 * free.
 */
export const revalidate = 86400;

const INK = rgb("#111111");
const MUTED = rgb("#6b6b6b");
const ACCENT = rgb("#b31d28");
const RULE = rgb("#cccccc");

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([fetchProduct(slug), fetchSettings()]);
  if (!product) return new Response("Not found", { status: 404 });

  const colors = product.colors?.length ? product.colors : colorsFromDescription(product.description);
  const doc = new PdfDocument();

  // No logo image is embedded here: the storefront ships SVG artwork, which is
  // not a raster. The text watermark is the honest fallback, and the admin
  // System page explains why via the same probe the writer uses.
  doc.setWatermark(null, BRAND.name.toUpperCase());
  doc.footer(`${BRAND.name} · ${BRAND.domain}`, EMAILS.support);

  let y = PAGE.A4.height - PAGE.MARGIN;

  // Masthead
  y = doc.text(BRAND.name.toUpperCase(), y, { size: 22, bold: true, color: ACCENT, leading: 26 });
  y = doc.text("PRODUCT SPECIFICATION", y, { size: 9, bold: true, color: MUTED, leading: 22 });
  y = doc.rule(y, RULE, 1.2);

  y = doc.paragraph(product.name, y, { size: 18, bold: true, color: INK });
  if (product.tagline || product.blurb) {
    y = doc.paragraph(product.tagline || product.blurb, y - 2, { size: 10, color: MUTED });
  }

  y -= 8;
  const price = `$${(product.priceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const wasPrice =
    product.compareAtCents && product.compareAtCents > product.priceCents
      ? `  (was $${(product.compareAtCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
      : "";
  y = doc.text(`${price}${wasPrice}`, y, { size: 16, bold: true, color: ACCENT });
  y = doc.text(product.inStock ? "In stock" : "Out of stock", y, { size: 9, color: MUTED, leading: 20 });

  // Description
  y = doc.ensureSpace(y, 60);
  y = doc.rule(y, RULE);
  y = doc.text("DESCRIPTION", y, { size: 9, bold: true, color: MUTED, leading: 16 });
  // Colours get their own section below; leaving the raw line here would
  // print it twice.
  y = doc.paragraph(colors.length ? stripColorLines(product.description) : product.description, y, {
    size: 10,
    color: INK,
  });

  // Specifications
  if (product.specs.length > 0) {
    y = doc.ensureSpace(y, 60);
    y -= 6;
    y = doc.rule(y, RULE);
    y = doc.text("SPECIFICATIONS", y, { size: 9, bold: true, color: MUTED, leading: 16 });
    for (const spec of product.specs) {
      y = doc.ensureSpace(y, 18);
      doc.text(spec.label, y, { size: 10, color: MUTED });
      y = doc.text(spec.value, y, { size: 10, bold: true, color: INK, x: PAGE.MARGIN + 200 });
    }
  }

  // Colours — the same list the shop renders, so the sheet cannot disagree.
  if (colors.length > 0) {
    y = doc.ensureSpace(y, 70);
    y -= 6;
    y = doc.rule(y, RULE);
    y = doc.text("AVAILABLE COLOURS", y, { size: 9, bold: true, color: MUTED, leading: 18 });
    let x = PAGE.MARGIN;
    let rowTop = y;
    for (const color of colors) {
      const label = color.name;
      const boxWidth = 12;
      const labelWidth = Math.min(150, label.length * 5.2 + 22);
      if (x + labelWidth > PAGE.A4.width - PAGE.MARGIN) {
        x = PAGE.MARGIN;
        rowTop -= 20;
        rowTop = doc.ensureSpace(rowTop, 24);
      }
      if (color.hex) {
        doc.rect(x, rowTop - 2, boxWidth, boxWidth, rgb(color.hex));
      } else {
        doc.rect(x, rowTop - 2, boxWidth, boxWidth, RULE);
      }
      doc.text(label, rowTop, { size: 9, color: INK, x: x + boxWidth + 5 });
      x += labelWidth + 10;
    }
    y = rowTop - 24;
  }

  // In the box
  if (product.boxContents.length > 0) {
    y = doc.ensureSpace(y, 60);
    y = doc.rule(y, RULE);
    y = doc.text("IN THE BOX", y, { size: 9, bold: true, color: MUTED, leading: 16 });
    for (const line of product.boxContents) {
      y = doc.ensureSpace(y, 16);
      y = doc.paragraph(`-  ${line}`, y, { size: 10, color: INK });
    }
  }

  // Delivery and contact — the same window the site and the emails quote.
  y = doc.ensureSpace(y, 90);
  y -= 6;
  y = doc.rule(y, RULE);
  y = doc.text("DELIVERY", y, { size: 9, bold: true, color: MUTED, leading: 16 });
  y = doc.paragraph(
    `Free worldwide shipping. Delivery runs ${deliveryWindowLabel(null)} from the day payment is confirmed, including a transit allowance by destination. Progress updates are emailed along the way.`,
    y,
    { size: 10, color: INK },
  );

  y = doc.ensureSpace(y, 70);
  y -= 6;
  y = doc.rule(y, RULE);
  y = doc.text("CONTACT", y, { size: 9, bold: true, color: MUTED, leading: 16 });
  y = doc.text(settings.contact.email || EMAILS.support, y, { size: 10, color: INK });
  y = doc.text(settings.contact.phone, y, { size: 10, color: INK });
  y = doc.text(settings.contact.address, y, { size: 10, color: MUTED });
  doc.text(`https://${BRAND.domain}/products/${product.slug}`, y, { size: 9, color: ACCENT });

  const bytes = doc.build();
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}-spec.pdf"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
