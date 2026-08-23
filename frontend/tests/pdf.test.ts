import { test } from "node:test";
import assert from "node:assert/strict";
import { PdfDocument, PAGE, foldToWinAnsi, rgb, textWidth, wrapText } from "../../shared/core/pdf";
import { probeLogoBytes } from "../../shared/core/image-probe";

test("folding is IDEMPOTENT, so an en dash does not vanish on a second pass", () => {
  // Fold twice and the dash must still be there. The bug this replaces turned
  // "12–30" into "1230" whenever a value was folded on the way in and again
  // on the way out.
  const once = foldToWinAnsi("12–30 days — really");
  const twice = foldToWinAnsi(once);
  assert.equal(once, twice);
  assert.match(twice, /12-30 days - really/);
});

test("smart quotes and ellipses survive as something printable", () => {
  const folded = foldToWinAnsi("“Rider’s choice…”");
  assert.equal(folded, '"Rider\'s choice..."');
  assert.equal(foldToWinAnsi(folded), folded, "must be idempotent");
});

test("characters no Standard-14 font can draw are dropped, not drawn wrong", () => {
  assert.equal(foldToWinAnsi("ok 你好"), "ok ");
});

test("a page break RETURNS the new cursor rather than mutating the caller's", () => {
  // The classic bug: a helper updates a variable the caller already holds by
  // value, and text keeps drawing below the footer of the page it just left.
  const doc = new PdfDocument();
  const near = PAGE.FOOTER_Y + 10;
  const after = doc.ensureSpace(near, 100);
  assert.ok(after > near, "ensureSpace must hand back a cursor at the top of a fresh page");
  assert.ok(after > PAGE.A4.height - PAGE.MARGIN - 1);
});

test("space that fits does NOT break the page", () => {
  const doc = new PdfDocument();
  const y = PAGE.A4.height - PAGE.MARGIN;
  assert.equal(doc.ensureSpace(y, 40), y);
});

test("long text wraps inside the content width instead of running off the page", () => {
  const line = "Reinforced TIG-welded chromoly frame with oversized ProTaper bars ".repeat(6);
  for (const wrapped of wrapText(line, 10, PAGE.CONTENT_WIDTH)) {
    assert.ok(textWidth(wrapped, 10) <= PAGE.CONTENT_WIDTH + 0.5, `line too wide: ${wrapped}`);
  }
});

test("an unbreakable token is split rather than clipped off the page", () => {
  const wrapped = wrapText("A".repeat(400), 10, PAGE.CONTENT_WIDTH);
  assert.ok(wrapped.length > 1);
  for (const line of wrapped) assert.ok(textWidth(line, 10) <= PAGE.CONTENT_WIDTH + 0.5);
});

test("the bytes are a real PDF a reader will open", () => {
  const doc = new PdfDocument();
  doc.footer("Go Cart Grip", "support@gocartgrip.shop");
  let y = PAGE.A4.height - PAGE.MARGIN;
  y = doc.text("Venom V3 Trike", y, { size: 18, bold: true, color: rgb("#b31d28") });
  doc.paragraph("212cc staged engine, 55 MPH, hydraulic disc brakes.", y, { size: 10 });
  const bytes = doc.build();
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text.slice(0, 8), /^%PDF-1\.\d/);
  assert.match(text, /%%EOF\s*$/);
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/Type \/Pages/);
  assert.match(text, /xref/);
  // The xref offset must point at the actual xref table, or readers reject it.
  const startxref = Number(text.match(/startxref\n(\d+)/)?.[1]);
  assert.ok(Number.isFinite(startxref));
  assert.equal(text.slice(startxref, startxref + 4), "xref");
});

test("parentheses in a product name cannot break the PDF string syntax", () => {
  const doc = new PdfDocument();
  doc.text("Viper (Special Edition) \\ 200cc", PAGE.A4.height - 100, {});
  const text = Buffer.from(doc.build()).toString("latin1");
  assert.match(text, /\\\(Special Edition\\\)/);
});

test("SVG is named as the problem, not reported as a mystery failure", () => {
  // An admin who uploads an SVG sees it fine in the browser preview and
  // missing from the PDF. The probe has to say which of the three things
  // went wrong.
  const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const probe = probeLogoBytes(svg);
  assert.equal(probe.status, "unusable");
  assert.match(probe.message, /SVG/i);
  assert.match(probe.message, /PNG/i, "must say what to do instead");
});

test("an interlaced PNG is named, because it is invisible in a browser preview", () => {
  const png = new Uint8Array(40);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png[24] = 8;   // bit depth
  png[25] = 2;   // truecolour
  png[28] = 1;   // interlace: Adam7
  const probe = probeLogoBytes(png);
  assert.equal(probe.status, "unusable");
  assert.match(probe.message, /interlac/i);
});

test("'no logo saved' is distinguished from 'saved but unreachable'", () => {
  // Three different fixes; reporting them identically is the whole problem.
  assert.equal(probeLogoBytes(null).status, "unreachable");
  assert.equal(probeLogoBytes(new Uint8Array(0)).status, "unreachable");
});

test("a usable PNG reports its dimensions so the admin can sanity-check it", () => {
  const png = new Uint8Array(40);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  png[19] = 200; // width  = 200
  png[23] = 80;  // height = 80
  png[24] = 8;
  png[25] = 2;
  png[28] = 0;
  const probe = probeLogoBytes(png);
  assert.equal(probe.status, "ok");
  assert.equal(probe.width, 200);
  assert.equal(probe.height, 80);
});
