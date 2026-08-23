import { test } from "node:test";
import assert from "node:assert/strict";
import { hasOrderNumber, orderReference } from "../src/shared/core/orders";

// Each test says what breaks on the live shop when it fails.

test("the email and the order page call an order by the SAME name", () => {
  const id = "ef0fa7b2-65b7-4ff9-be9d-6049d12af110";
  const number = "GCG-2026-0005";
  // Whatever a customer reads — receipt, payment confirmation, their order
  // page, the admin table — has to be one string. Two names for one order and
  // nobody can match the email they were sent to the order they are looking at.
  assert.equal(orderReference(id, number), "GCG-2026-0005");
  assert.equal(orderReference(id, number), orderReference(id, number));
});

test("an order placed before numbering existed still HAS a reference", () => {
  // Migration 004 backfilled numbers, but a null must never render as
  // "undefined" or an empty heading on someone's order page.
  const id = "ca152614-767c-4158-9461-b32e86ced2db";
  assert.equal(orderReference(id, null), "#CA152614");
  assert.equal(orderReference(id, undefined), "#CA152614");
  assert.equal(orderReference(id), "#CA152614");
});

test("a blank or whitespace number falls back rather than printing nothing", () => {
  const id = "ca152614-767c-4158-9461-b32e86ced2db";
  // An empty string is what a trimmed-to-nothing column looks like; treating
  // it as a real number puts a blank where the order name belongs.
  assert.equal(orderReference(id, ""), "#CA152614");
  assert.equal(orderReference(id, "   "), "#CA152614");
});

test("a number with stray whitespace is trimmed, not shown ragged", () => {
  assert.equal(orderReference("ca152614-767c-4158", "  GCG-2026-0148 "), "GCG-2026-0148");
});

test("the uuid fallback is upper-cased so support can read it back over a phone", () => {
  assert.equal(orderReference("abcdef12-3456-7890-abcd-ef1234567890"), "#ABCDEF12");
});

test("hasOrderNumber tells a real number from the uuid fallback", () => {
  // Used to decide whether to show "Order GCG-…" or a bare reference; a blank
  // string counting as a number would label the fallback as allocated.
  assert.equal(hasOrderNumber("GCG-2026-0005"), true);
  assert.equal(hasOrderNumber(""), false);
  assert.equal(hasOrderNumber("  "), false);
  assert.equal(hasOrderNumber(null), false);
  assert.equal(hasOrderNumber(undefined), false);
});
