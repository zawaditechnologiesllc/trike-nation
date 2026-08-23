import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COURIERS,
  couriersByRegion,
  generateInternalReference,
  isInternalReference,
  trackingLink,
} from "../src/lib/core/couriers";

test("REFUSES to link an internal reference out to a carrier", () => {
  // A link that lands on "not found" makes the customer think nothing shipped.
  const reference = generateInternalReference(new Date("2026-08-01T00:00:00Z"), () => 5);
  const link = trackingLink("dhl", reference);
  assert.equal(link.url, null);
  assert.match(link.explanation, /internal reference/i);
});

test("links out when the courier is known AND the number is a real one", () => {
  const link = trackingLink("ups", "1Z999AA10123456784");
  assert.equal(link.url, "https://www.ups.com/track?tracknum=1Z999AA10123456784");
});

test("a courier with no public tracking URL shows plain text, not a dead link", () => {
  const courier = COURIERS.find((c) => !c.trackingUrl && c.id !== "other");
  assert.ok(courier, "expected at least one courier without a tracking URL");
  const link = trackingLink(courier.id, "ABC123456");
  assert.equal(link.url, null);
  assert.match(link.explanation, /plain text/i);
});

test("'Other — type it in' never produces a link", () => {
  assert.equal(trackingLink("other", "ABC123456").url, null);
});

test("the admin is TOLD what the customer will get, before saving", () => {
  // A silent decision here is indistinguishable from a broken feature.
  for (const input of [
    ["dhl", "1234567890"],
    ["dhl", ""],
    ["other", "ABC"],
    [null, "ABC"],
  ] as const) {
    const link = trackingLink(input[0], input[1]);
    assert.ok(link.explanation.length > 20, "every case must explain itself");
  }
});

test("generated references avoid the characters customers misread", () => {
  for (let i = 0; i < 30; i++) {
    const reference = generateInternalReference();
    const body = reference.split("-")[2] + reference.split("-")[3];
    assert.ok(!/[ILOU01]/.test(body), `${reference} contains a misreadable character`);
  }
});

test("a transposed pair invalidates the check character", () => {
  // Otherwise the check character is decoration and a typo passes validation.
  const reference = generateInternalReference(new Date("2026-08-01T00:00:00Z"), (max) => max - 1);
  assert.ok(isInternalReference(reference));
  const [prefix, date, body, check] = reference.split("-");
  const swapped = body[1] + body[0] + body.slice(2);
  if (swapped !== body) {
    assert.ok(!isInternalReference(`${prefix}-${date}-${swapped}-${check}`));
  }
});

test("a real carrier number is never mistaken for one of ours", () => {
  assert.equal(isInternalReference("1Z999AA10123456784"), false);
  assert.equal(isInternalReference("EE123456789GB"), false);
  assert.equal(isInternalReference(""), false);
  assert.equal(isInternalReference(null), false);
});

test("every courier belongs to a region the dropdown actually renders", () => {
  const grouped = couriersByRegion().flatMap((g) => g.couriers);
  assert.equal(grouped.length, COURIERS.length, "a courier is missing from the grouped list");
});

test("the dropdown always offers a way out for an unlisted carrier", () => {
  assert.ok(COURIERS.some((c) => c.id === "other"));
});
