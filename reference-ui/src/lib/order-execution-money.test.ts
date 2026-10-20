import { describe, expect, it } from "vitest";
import { orderCommandBody } from "../../../src/platform/procurement-order-execution-api";

describe("order execution decimal transport", () => {
  it("retains a wide exact product and version/reference fields without Number conversion", () => {
    const body = orderCommandBody({ expectedOrderVersion: 8, evidenceReference: 'verified "value"' }, { confirmedGrossAmount: "99999999999999.99990001" });
    expect(body).toBe('{"expectedOrderVersion":8,"evidenceReference":"verified \\"value\\"","confirmedGrossAmount":99999999999999.99990001}');
  });
  it.each(["01", "1e3", "NaN", "Infinity", "1,000", "1.123456789", '1,"status":"Approved"'])('rejects noncanonical or injected amount %s', (amount) => {
    expect(() => orderCommandBody({}, { releasedGrossAmount: amount })).toThrow("represented exactly");
  });
  it("rejects duplicate monetary keys instead of relying on JSON last-key behavior", () => {
    expect(() => orderCommandBody({ confirmedGrossAmount: "1" }, { confirmedGrossAmount: "2" })).toThrow("represented exactly");
  });
});
