import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyToCents, parseProductSheet, slugify } from "../../shared/core/product-sheet";

// A sheet written the way an owner actually writes one: inconsistent
// separators, mixed field names, colours in three different shapes.
const SHEET = `
Name: "Viper" Special Edition TGV Mini Trike
Price: $1,100.00
Was: $1,200
Category: Mini Trikes
Engine: 200cc
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
Category: Mini Bikes
Engine: 212CC
Details: Raw power in a compact frame.
- Available in Red, Black and Blue
Stock: out of stock
`;

test("a real sheet imports every product in it", () => {
  const { products, rejected } = parseProductSheet(SHEET);
  assert.equal(products.length, 2, `rejected: ${JSON.stringify(rejected)}`);
  assert.deepEqual(rejected, []);
});

test("prices survive currency symbols and thousands separators", () => {
  const { products } = parseProductSheet(SHEET);
  assert.equal(products[0].priceCents, 110000);
  assert.equal(products[0].compareAtCents, 120000);
  assert.equal(products[1].priceCents, 65000);
});

test("a thousands separator is never mistaken for a decimal point", () => {
  // "$1,200" is twelve hundred dollars, not one dollar twenty. Reading the
  // comma as a decimal prices the machine at 1/1000th of its value.
  assert.equal(parseMoneyToCents("$1,200"), 120000);
  assert.equal(parseMoneyToCents("1.200"), 120000, "European thousands grouping");
  assert.equal(parseMoneyToCents("1,299,000"), 129900000);
});

test("a decimal point is never mistaken for a thousands separator", () => {
  // And the mirror error: "99.50" must not become 9950 dollars.
  assert.equal(parseMoneyToCents("99.50"), 9950);
  assert.equal(parseMoneyToCents("99,50"), 9950, "European decimal comma");
  assert.equal(parseMoneyToCents("$8.5"), 850);
});

test("both notations agree on the same amount", () => {
  assert.equal(parseMoneyToCents("€1.299,00"), 129900);
  assert.equal(parseMoneyToCents("$1,299.00"), 129900);
  assert.equal(parseMoneyToCents("1299"), 129900);
});

test("junk in the price field is REJECTED rather than imported as free", () => {
  // A product silently priced at $0.00 is the worst possible import failure.
  assert.equal(parseMoneyToCents("call for pricing"), null);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("-50"), null);
  const { products, rejected } = parseProductSheet("Name: Mystery Kart\nPrice: call us\nCategory: Karts");
  assert.equal(products.length, 0);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /no readable price/i);
});

test("a block with no name is reported, not silently dropped", () => {
  const { rejected } = parseProductSheet("Price: $500\nCategory: Parts");
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /name/i);
});

test("colours import in all three shapes from the same sheet", () => {
  const { products } = parseProductSheet(SHEET);
  assert.deepEqual(products[0].colors.map((c) => c.name), ["Viper Red", "Midnight Black"]);
  assert.deepEqual(products[1].colors.map((c) => c.name), ["Red", "Black", "Blue"]);
});

test("the colour line does not survive into the description", () => {
  const { products } = parseProductSheet(SHEET);
  assert.ok(!products[0].description.includes("#b31d28"));
});

test("bulleted sections become lists, not one run-on string", () => {
  const { products } = parseProductSheet(SHEET);
  assert.deepEqual(products[0].boxContents, ["Fully Assembled Viper", "2x Replacement Sleeves"]);
  assert.deepEqual(products[0].specs, [
    { label: "Top Speed", value: "45 MPH" },
    { label: "Frame", value: "Reinforced TIG-Welded Steel" },
  ]);
});

test("out-of-stock is honoured, so a sold-out item does not import as buyable", () => {
  const { products } = parseProductSheet(SHEET);
  assert.equal(products[0].inStock, true);
  assert.equal(products[1].inStock, false);
});

test("field names are matched by their common aliases", () => {
  // Sheets say Product/Title, Details/About, Was/RRP — a parser that only
  // accepts one spelling rejects most real files.
  const { products } = parseProductSheet(
    "Title: Test Kart\nCost: $99\nAbout: A kart.\nRRP: $150\nType: Karts",
  );
  assert.equal(products.length, 1);
  assert.equal(products[0].priceCents, 9900);
  assert.equal(products[0].compareAtCents, 15000);
  assert.equal(products[0].category, "karts");
});

test("blocks separate on a rule OR on the next Name:, whichever the sheet uses", () => {
  const noRule = "Name: A\nPrice: $10\nName: B\nPrice: $20";
  assert.equal(parseProductSheet(noRule).products.length, 2);
});

test("slugs are safe for a URL and derived from the name when absent", () => {
  assert.equal(slugify('"Viper" Special Edition TGV'), "viper-special-edition-tgv");
  const { products } = parseProductSheet(SHEET);
  assert.equal(products[0].slug, "viper-special-edition-tgv-mini-trike");
});

test("a missing category WARNS rather than failing the import", () => {
  // Losing a whole product over a missing category is worse than importing it
  // uncategorised and telling the admin.
  const { products } = parseProductSheet("Name: Orphan\nPrice: $10");
  assert.equal(products.length, 1);
  assert.ok(products[0].warnings.some((w) => /category/i.test(w)));
});
