import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRisk, riskLevel, riskFlags, shouldBadge } from "../../shared/core/risk";

test("a VPN user ALONE never reaches the top level", () => {
  // An owner who sees red on every VPN user stops reading badges within a
  // week — and then misses the order that mattered.
  const level = assessRisk({ country: "US", timezone: "America/Los_Angeles", isVpn: true }, "US").level;
  assert.notEqual(level, "high");
  assert.equal(shouldBadge(level), false);
});

test("no single flag except Tor reaches the top level", () => {
  const singles = [
    { isVpn: true }, { isDatacenter: true }, { country: null },
    { country: "US", timezone: "Europe/Berlin" },
  ];
  for (const origin of singles) {
    const flags = riskFlags(origin, "US");
    assert.notEqual(riskLevel(flags), "high", `${JSON.stringify(origin)} alone must not be high`);
  }
  assert.equal(riskLevel(riskFlags({ isTor: true })), "high");
});

test("a VPN moves the IP but not the clock, and that pair IS flagged", () => {
  const flags = riskFlags({ country: "US", timezone: "Europe/Moscow" }, "US");
  assert.ok(flags.some((f) => f.code === "clock_mismatch"));
});

test("a traveller is not flagged for a timezone we have no hints for", () => {
  // Claiming a mismatch we cannot actually detect is a false accusation.
  const flags = riskFlags({ country: "XX", timezone: "Antarctica/Troll" }, "XX");
  assert.ok(!flags.some((f) => f.code === "clock_mismatch"));
});

test("an ordinary domestic order shows no badge at all", () => {
  const assessment = assessRisk({ country: "US", timezone: "America/New_York" }, "US");
  assert.equal(assessment.level, "clear");
  assert.equal(shouldBadge(assessment.level), false);
});

test("every flag is explained in plain English for a non-analyst", () => {
  const flags = riskFlags(
    { country: "US", timezone: "Europe/Moscow", isVpn: true, isDatacenter: true },
    "GB",
  );
  assert.ok(flags.length > 0);
  for (const flag of flags) {
    assert.ok(flag.explanation.length > 40, `${flag.code} needs a real explanation`);
    assert.ok(!/\b(ASN|heuristic|entropy)\b/.test(flag.explanation), `${flag.code} uses jargon`);
  }
});

test("assessment NEVER returns a decision to refuse the order", () => {
  // The module must not grow a "block" level. Card fraud is stopped at the
  // payment layer; refusing here costs real customers.
  const assessment = assessRisk({ isTor: true }, "US");
  assert.ok(["clear", "note", "review", "high"].includes(assessment.level));
  assert.ok(!("blocked" in assessment));
});
