import { afterEach, describe, expect, it, vi } from "vitest";
import { roundInstantToLocal, roundLocalToUtc, roundScheduleForCommand, roundBrowserTimeZone } from "../../../shared/procurement-round-schedule";
afterEach(() => vi.unstubAllEnvs());
describe("evaluation plan local date controls", () => {
  it("displays browser-local time and converts edited values to UTC without treating company time zone as browser time", () => {
    vi.stubEnv("TZ", "Africa/Lusaka");
    expect(roundBrowserTimeZone()).toBe("Africa/Lusaka");
    expect(roundInstantToLocal("2026-12-01T09:30:12.345678+00:00")).toBe("2026-12-01T11:30:12.345");
    expect(roundLocalToUtc("2026-12-01T11:30:12.345")).toBe("2026-12-01T09:30:12.345Z");
    expect(roundLocalToUtc("2026-12-01T11:30")).toBe("2026-12-01T09:30:00.000Z");
  });
  it("preserves the exact retained instant until edited, including microseconds", () => {
    vi.stubEnv("TZ", "UTC");
    const source = { opensAt: "2026-12-01T09:30:12.345678+00:00", closesAt: "2026-12-02T09:30:12.123456Z", technicalReleaseAt: null, commercialReleaseAt: null };
    expect(roundScheduleForCommand(source)).toEqual(source);
    const edited = roundScheduleForCommand(source, { opensAt: "2026-12-01T10:30:12.345" });
    expect(edited.opensAt).toBe("2026-12-01T10:30:12.345Z"); expect(edited.closesAt).toBe(source.closesAt); expect(source.opensAt).toBe("2026-12-01T09:30:12.345678+00:00");
  });
  it("keeps empty optional fields empty and rejects malformed, impossible or timezone-suffixed local values", () => {
    expect(roundInstantToLocal(null)).toBe(""); expect(roundLocalToUtc("")).toBeNull();
    for (const invalid of ["not a date", "2026-02-30T09:00", "2026-12-01T24:01", "2026-12-01T09:00Z", "2026-12-01T09:00:00.123456"])
      expect(() => roundLocalToUtc(invalid)).toThrow("valid local date");
    expect(() => roundInstantToLocal("not a date")).toThrow();
  });
});
