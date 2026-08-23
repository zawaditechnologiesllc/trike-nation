import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_MAX_DAYS,
  BUILD_MIN_DAYS,
  deliveryWindow,
  deliveryWindowLabel,
  estimatedDeliveryAt,
  zoneFor,
} from "../src/lib/core/delivery";

test("an unknown country is SERVED, not refused", () => {
  // Refusing an unrecognised destination silently loses real customers.
  assert.equal(zoneFor("ZZ"), "extended");
  assert.equal(zoneFor(null), "extended");
  assert.equal(zoneFor(undefined), "extended");
  assert.ok(deliveryWindow("ZZ").maxDays > 0);
});

test("the domestic quote adds no transit time on top of the build window", () => {
  const w = deliveryWindow("US");
  assert.equal(w.minDays, BUILD_MIN_DAYS);
  assert.equal(w.maxDays, BUILD_MAX_DAYS);
});

test("a further destination is quoted longer, never shorter", () => {
  const domestic = deliveryWindow("US");
  const established = deliveryWindow("GB");
  const extended = deliveryWindow("ZZ");
  assert.ok(established.maxDays > domestic.maxDays);
  assert.ok(extended.maxDays > established.maxDays);
});

test("every surface reads the same label, so the PDF cannot contradict the email", () => {
  assert.equal(deliveryWindowLabel("US"), "12–30 days");
  assert.equal(deliveryWindowLabel("GB"), "17–35 days");
});

test("country codes are matched case-insensitively", () => {
  assert.equal(zoneFor("us"), "domestic");
  assert.equal(zoneFor(" Gb "), "established");
});

test("the estimated arrival date is the far end of the quote, not the near end", () => {
  // Promising the optimistic date is how a shop generates "where is my order".
  const paidAt = new Date("2026-01-01T00:00:00Z");
  const eta = estimatedDeliveryAt(paidAt, "US");
  const days = Math.round((eta.getTime() - paidAt.getTime()) / 86_400_000);
  assert.equal(days, BUILD_MAX_DAYS);
});
