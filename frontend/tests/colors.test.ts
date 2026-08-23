import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_HEADINGS,
  stripColorLines,
  colorsFromSentence,
  defaultColor,
  parseColors,
  resolveColor,
} from "../src/shared/core/colors";

// Each test says what breaks on the live shop when it fails.

test("a sheet writing colours inline still shows swatches", () => {
  const colors = parseColors("Colors: Midnight Black #101010, Voltage Blue #1e5bff, Hazard Lime");
  assert.deepEqual(colors, [
    { name: "Midnight Black", hex: "#101010" },
    { name: "Voltage Blue", hex: "#1e5bff" },
    { name: "Hazard Lime", hex: null },
  ]);
});

test("a heading on its own line with bulleted items still shows swatches", () => {
  const colors = parseColors("COLOURS\n- Midnight Black\n- Voltage Blue\n\nWeight: 145 lbs");
  assert.deepEqual(colors.map((c) => c.name), ["Midnight Black", "Voltage Blue"]);
});

test("colours written as a sentence mid-bullet-list are still found", () => {
  // The real sheets that broke the first parser looked exactly like this:
  // no heading at all, just a sentence in a list of features.
  const colors = parseColors(
    "- Reinforced frame\n- Available in Red, Black, White, Blue, and Purple\n- Hydraulic disc brakes",
  );
  assert.deepEqual(colors.map((c) => c.name), ["Red", "Black", "White", "Blue", "Purple"]);
});

test("the Oxford comma does not produce a colour called 'and Purple'", () => {
  const colors = colorsFromSentence("Available in Red, Black, and Purple");
  assert.ok(!colors.some((c) => /^and\b/i.test(c.name)), "conjunction leaked into a colour name");
  assert.deepEqual(colors.map((c) => c.name), ["Red", "Black", "Purple"]);
});

test("REFUSES voltages, so '48V, 60V and 72V' never renders as swatches", () => {
  // A false positive here puts a sentence fragment on the live product page.
  assert.deepEqual(colorsFromSentence("Available in 48V, 60V and 72V"), []);
});

test("REFUSES place names, so shipping copy never renders as swatches", () => {
  assert.deepEqual(colorsFromSentence("Available in the UK, Europe and North America"), []);
});

test("REFUSES a single item, because one 'colour' is almost always prose", () => {
  assert.deepEqual(colorsFromSentence("Available in black"), []);
});

test("hex is accepted before, after or in brackets", () => {
  assert.equal(parseColors("Colors: #101010 Midnight Black")[0].hex, "#101010");
  assert.equal(parseColors("Colors: Midnight Black (#101010)")[0].hex, "#101010");
  assert.equal(parseColors("Colors: Lime #0f0")[0].hex, "#00ff00", "3-digit hex must expand");
});

test("duplicates collapse, keeping the entry that carries a hex", () => {
  const colors = parseColors("Colors: Black, Black #101010, black");
  assert.equal(colors.length, 1);
  assert.equal(colors[0].hex, "#101010");
});

test("the importer and the description reader share ONE heading list", () => {
  // Two modules keeping their own copy of this vocabulary is the bug with the
  // longest fuse: a sheet imports fine and then shows no swatches.
  for (const heading of COLOR_HEADINGS) {
    const colors = parseColors(`${heading}: Red, Blue`);
    assert.equal(colors.length, 2, `heading "${heading}" produced no colours`);
  }
});

test("a product with no colours does not block checkout", () => {
  assert.equal(defaultColor([]), null);
  assert.equal(resolveColor([], undefined), null);
});

test("a line with no colour gets the first one, not a rejection", () => {
  // Every unit has a colour whether or not the buyer thought about it;
  // refusing the line would cost the sale.
  const colors = parseColors("Colors: Red, Blue");
  assert.equal(resolveColor(colors, undefined), "Red");
  assert.equal(resolveColor(colors, null), "Red");
});

test("REFUSES a colour the product does not come in, rather than substituting", () => {
  // Quietly swapping in the default would put a colour on the order that the
  // buyer explicitly did not ask for.
  const colors = parseColors("Colors: Red, Blue");
  assert.throws(() => resolveColor(colors, "Chartreuse"), /not a colour this product comes in/);
});

test("colour matching ignores case and surrounding space", () => {
  const colors = parseColors("Colors: Midnight Black, Voltage Blue");
  assert.equal(resolveColor(colors, "  midnight black "), "Midnight Black");
});

test("the colour line is REMOVED from the description it was parsed out of", () => {
  // Otherwise the product page shows "Colors: Viper Red #b31d28, …" as body
  // text directly above the swatches rendering exactly that.
  const description = "A fast trike.\n\nColors: Viper Red #b31d28, Midnight Black #101010\n\nBuilt in California.";
  const stripped = stripColorLines(description);
  assert.ok(!stripped.includes("#b31d28"));
  assert.ok(!/Colors:/i.test(stripped));
  assert.match(stripped, /A fast trike/);
  assert.match(stripped, /Built in California/);
});

test("a sentence-form colour list is removed too", () => {
  const stripped = stripColorLines("- Reinforced frame\n- Available in Red, Black and Blue\n- Disc brakes");
  assert.ok(!/Available in Red/.test(stripped));
  assert.match(stripped, /Reinforced frame/);
  assert.match(stripped, /Disc brakes/);
});

test("stripping NEVER removes a line that produced no swatches", () => {
  // The two use the same detection, so text can never vanish without the
  // colours appearing — or appear as swatches while still shown as text.
  const description = "Available in 48V, 60V and 72V configurations.\nShips worldwide.";
  assert.equal(stripColorLines(description).trim(), description.trim());
});
