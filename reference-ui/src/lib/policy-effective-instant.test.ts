import { describe, expect, it } from "vitest";
import { samePolicyInstant, selectedPolicyInstant, utcPolicyDay } from "./policy-effective-instant";

describe("manual policy effective instants", () => {
  const saved = "2026-11-01T13:27:05.123+02:00";
  it("preserves the exact saved instant when editing only a currency ceiling", () => {
    expect(utcPolicyDay(saved)).toBe("2026-11-01");
    expect(selectedPolicyInstant("2026-11-01", saved)).toBe(saved);
    expect(samePolicyInstant(saved, "2026-11-01T11:27:05.123Z")).toBe(true);
  });
  it("uses explicit midnight UTC only for a new or changed date", () => {
    expect(selectedPolicyInstant("2026-11-02", saved)).toBe("2026-11-02T00:00:00.000Z");
    expect(selectedPolicyInstant("2026-11-02", null)).toBe("2026-11-02T00:00:00.000Z");
    expect(selectedPolicyInstant("", null)).toBeNull();
  });
  it("rejects invalid dates and different instants instead of comparing calendar days", () => {
    expect(() => selectedPolicyInstant("2026-02-30", null)).toThrow();
    expect(samePolicyInstant("2026-11-01T11:27:05Z", "2026-11-01T00:00:00Z")).toBe(false);
  });
});
