import { describe, expect, it } from "vitest";
import { manualUnitQueueAllRead } from "./manual-unit-review-access";

describe("manual unit review company All admission", () => {
  it("admits only the purpose reviewer collection with physical read capability", () => {
    expect(manualUnitQueueAllRead("/approvals", true, ["procurement-invoice-unit-review"])).toBe(true);
    for (const path of ["/approvals/", "/approvals/manual-unit-review/11111111-1111-4111-8111-111111111111",
      "/approvals/unit-review/11111111-1111-4111-8111-111111111111"])
      expect(manualUnitQueueAllRead(path, true, ["procurement-invoice-unit-review"])).toBe(false);
    expect(manualUnitQueueAllRead("/approvals", false, ["procurement-invoice-unit-review"])).toBe(false);
    expect(manualUnitQueueAllRead("/approvals", true, ["procurement-invoice-unit-review-request"])).toBe(false);
  });
});
