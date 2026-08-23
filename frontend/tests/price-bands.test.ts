import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePriceBands, parsePriceRange, withinRange } from "../../shared/core/price-bands";

const CATALOGUE = [8_500, 65_000, 110_000, 129_900, 129_900, 139_900, 165_000, 189_900, 249_900];

test("NEVER offers a band that leads to an empty grid", () => {
  // Hard-coded bands become links to nothing the moment the catalogue moves.
  const bands = derivePriceBands(CATALOGUE);
  assert.ok(bands.length > 0);
  for (const band of bands) assert.ok(band.count > 0, `${band.label} is empty`);
});

test("the bands between them cover every product exactly once", () => {
  const bands = derivePriceBands(CATALOGUE);
  const total = bands.reduce((sum, band) => sum + band.count, 0);
  assert.equal(total, CATALOGUE.length);
});

test("an empty catalogue offers no filters rather than crashing", () => {
  assert.deepEqual(derivePriceBands([]), []);
});

test("a one-price catalogue does not render four identical bands", () => {
  const bands = derivePriceBands([50_000, 50_000, 50_000]);
  assert.equal(bands.length, 1);
});

test("bands are labelled on round numbers a shopper recognises", () => {
  for (const band of derivePriceBands(CATALOGUE)) {
    assert.ok(!/\.\d/.test(band.label), `${band.label} shows cents`);
  }
});

test("a reversed min/max is read as a typo, not served as an empty shop", () => {
  const range = parsePriceRange("2000", "500");
  assert.equal(range.minCents, 50_000);
  assert.equal(range.maxCents, 200_000);
});

test("junk in the URL is ignored rather than 500ing the shop page", () => {
  assert.deepEqual(parsePriceRange("abc", null), { minCents: null, maxCents: null });
  assert.deepEqual(parsePriceRange("-5", undefined), { minCents: null, maxCents: null });
  assert.deepEqual(parsePriceRange(null, null), { minCents: null, maxCents: null });
});

test("currency symbols and commas typed by a human still work", () => {
  assert.equal(parsePriceRange("$1,299", null).minCents, 129_900);
});

test("an open-ended range filters on the end that was given", () => {
  assert.ok(withinRange(150_000, { minCents: 100_000, maxCents: null }));
  assert.ok(!withinRange(50_000, { minCents: 100_000, maxCents: null }));
  assert.ok(withinRange(50_000, { minCents: null, maxCents: 100_000 }));
});
