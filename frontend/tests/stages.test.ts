import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ABANDONED_REMINDER_DAYS,
  abandonedStageKey,
  dueAbandonedReminder,
  dueStage,
  dueStages,
  isAfter,
} from "../src/lib/core/stages";

const paid = new Date("2026-01-01T00:00:00Z");
const plus = (days: number) => new Date(paid.getTime() + days * 86_400_000);

test("a cron that was down for a week sends ONE email, not four", () => {
  // dueStage returns the LAST due stage. Returning the next one instead makes
  // a catch-up run fire every missed stage in a minute.
  assert.equal(dueStage(paid, plus(40))?.stage, "arriving");
});

test("an order paid 40 days ago lands on its correct stage in one step", () => {
  const stage = dueStage(paid, plus(40));
  assert.equal(stage?.day, 20);
});

test("nothing is due before the first milestone", () => {
  assert.equal(dueStage(paid, plus(6))?.stage, "confirmed");
  assert.equal(dueStage(paid, plus(6))?.emails, false, "day 0 must not re-email the receipt");
});

test("each milestone becomes due on its own day", () => {
  assert.equal(dueStage(paid, plus(7))?.stage, "building");
  assert.equal(dueStage(paid, plus(12))?.stage, "shipped");
  assert.equal(dueStage(paid, plus(20))?.stage, "arriving");
});

test("skipped stages are still recorded, so the timeline has no holes", () => {
  const stages = dueStages(paid, plus(20)).map((s) => s.stage);
  assert.deepEqual(stages, ["confirmed", "building", "shipped", "arriving"]);
});

test("stage ordering is comparable, so an order cannot move backwards silently", () => {
  assert.ok(isAfter("shipped", "building"));
  assert.ok(!isAfter("building", "shipped"));
});

test("abandoned chasing STOPS after day 12 rather than nagging forever", () => {
  assert.equal(dueAbandonedReminder(paid, plus(12)), 12);
  assert.equal(dueAbandonedReminder(paid, plus(40)), 12, "must not invent a fourth reminder");
  assert.equal(ABANDONED_REMINDER_DAYS.length, 3);
});

test("no reminder is due before day 3", () => {
  assert.equal(dueAbandonedReminder(paid, plus(2)), null);
});

test("each reminder claims a DISTINCT stage key, so overlapping runs cannot double-send", () => {
  const keys = ABANDONED_REMINDER_DAYS.map(abandonedStageKey);
  assert.equal(new Set(keys).size, keys.length);
});
