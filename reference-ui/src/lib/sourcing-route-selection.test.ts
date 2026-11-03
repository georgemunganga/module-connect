import { describe, expect, it } from "vitest";
import { quotationRouteSelected } from "./sourcing-route-selection";
import { roundPlanRouteSelected } from "./round-plan-access";
const quoteRead = "procurement-quotation-read";
describe("RFQ render and All-read route consistency", () => {
  it("does not admit an explicit M4 or ad-hoc detail through a mixed account's quotation READ", () => {
    const permissions = [quoteRead, "procurement-round-plan-read", "procurement-sourcing-convert", "procurement-sourcing-submit", "procurement-sourcing-read"];
    for (const source of ["principal-approved", "approved", "ad-hoc"]) {
      expect(quotationRouteSelected(source, permissions)).toBe(false);
      expect(roundPlanRouteSelected(source, { capabilities: { roundPlanRead: true, roundPlanRecord: false }, permissions })).toBe(false);
    }
  });
  it("keeps explicit quotation reads under All even for mixed accounts", () => {
    expect(quotationRouteSelected("quotations", [quoteRead, "procurement-sourcing-read", "procurement-sourcing-submit"])).toBe(true);
  });
  it("keeps the default quotation-only route and does not misroute it to round planning", () => {
    const permissions = [quoteRead, "procurement-round-plan-read"];
    expect(quotationRouteSelected(null, permissions)).toBe(true);
    expect(roundPlanRouteSelected(null, { capabilities: { roundPlanRead: true, roundPlanRecord: false }, permissions })).toBe(false);
  });
  it.each(["procurement-sourcing-read", "procurement-sourcing-create", "procurement-sourcing-edit", "procurement-sourcing-convert", "procurement-sourcing-submit"])("preserves the old non-quotation default for %s", permission => {
    expect(quotationRouteSelected(null, [quoteRead, permission])).toBe(false);
  });
  it("preserves the original publisher-only quotation default and explicit route precedence", () => {
    expect(quotationRouteSelected(null, [quoteRead, "procurement-sourcing-publish"])).toBe(true);
    expect(quotationRouteSelected("round-plan", [quoteRead])).toBe(false);
    expect(quotationRouteSelected(null, [])).toBe(false);
  });
});
