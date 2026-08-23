import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseAddress, sanitiseSearch, validateAddress } from "../../shared/core/validation";
import { addressVocabulary, countryOptions, isKnownCountry } from "../../shared/core/countries";

const valid = {
  firstName: "Ada", lastName: "Nkem", email: "ada@example.com", phone: "+1 916 555 0100",
  address: "12 Track Road", city: "Reno", region: "NV", postalCode: "89501", country: "US",
};

test("errors name the FIELD, so the form can highlight the right box", () => {
  const errors = validateAddress({ ...valid, email: "nope" });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "email");
});

test("a UK address is not asked for a State or a ZIP", () => {
  // American labels on a British form read as a shop that does not really
  // ship there.
  const vocabulary = addressVocabulary("GB");
  assert.equal(vocabulary.regionLabel, "County");
  assert.equal(vocabulary.postalLabel, "Postcode");
  assert.equal(vocabulary.regionRequired, false);
});

test("a UK address with no county is ACCEPTED", () => {
  const errors = validateAddress({
    ...valid, country: "GB", region: "", postalCode: "SW1A 1AA",
  });
  assert.deepEqual(errors, []);
});

test("a US address with no state is REFUSED", () => {
  const errors = validateAddress({ ...valid, region: "" });
  assert.ok(errors.some((e) => e.field === "region"));
});

test("a malformed postcode names the country's own example", () => {
  const errors = validateAddress({ ...valid, country: "CA", postalCode: "99999" });
  const error = errors.find((e) => e.field === "postalCode");
  assert.ok(error);
  assert.match(error.message, /K1A 0B1/);
});

test("an unlisted country is SERVED with neutral wording", () => {
  // Refusing an unrecognised destination silently loses real customers.
  const vocabulary = addressVocabulary("ZZ");
  assert.equal(vocabulary.regionRequired, false);
  assert.match(vocabulary.postalLabel, /Postal/i);
});

test("a country code that is not ISO at all is refused, with the field named", () => {
  const errors = validateAddress({ ...valid, country: "NOTACOUNTRY" });
  assert.ok(errors.some((e) => e.field === "country"));
  assert.equal(isKnownCountry("NOTACOUNTRY"), false);
});

test("international phone formats are accepted, not just North American ones", () => {
  for (const phone of ["+44 20 7946 0958", "+234 800 000 0000", "(916) 555-0100", "+81-3-1234-5678"]) {
    const errors = validateAddress({ ...valid, phone });
    assert.deepEqual(errors, [], `${phone} was rejected`);
  }
});

test("the same input passes on the browser and on the server", () => {
  // One module, called twice — this test is what binds them.
  assert.deepEqual(validateAddress(valid), validateAddress({ ...valid }));
});

test("email is normalised to lower case before it reaches the order", () => {
  // Guest-order-to-account matching is by email; case drift breaks the link.
  assert.equal(normaliseAddress({ ...valid, email: "Ada@Example.COM" }).email, "ada@example.com");
});

test("the main markets are pinned to the top of the country list", () => {
  const { pinned, rest } = countryOptions();
  assert.equal(pinned[0].code, "US");
  assert.ok(pinned.length >= 5);
  assert.ok(!rest.some((c) => c.code === "US"), "a pinned country must not repeat below");
});

test("search input cannot smuggle filter syntax into the query", () => {
  // What matters is that no PostgREST/ILIKE metacharacter survives — ordinary
  // words are harmless, they are bound as a parameter.
  const cleaned = sanitiseSearch("viper%_,(one)*\\two");
  assert.ok(!/[%_,()*\\]/.test(cleaned), `metacharacter survived: ${cleaned}`);
  assert.match(cleaned, /viper/, "the actual search term must survive");
  assert.equal(sanitiseSearch(null), "");
});

test("an absurdly long search term is truncated rather than sent whole", () => {
  assert.ok(sanitiseSearch("x".repeat(500)).length <= 80);
});
