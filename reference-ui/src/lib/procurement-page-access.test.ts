import { describe, expect, it } from "vitest";
import { canOpenProcurementPage as can } from "./procurement-page-access";
const requests = ["procurement-access", "procurement-request-read", "procurement-request-create", "procurement-request-edit", "procurement-request-submit"];
describe("effective Procurement page access", () => {
  it("keeps request-only roles out of unrelated workflows and unknown pages", () => {
    for (const path of ["/", "/requests", "/requests/new?entry=department", "/requests/id/edit"]) expect(can(path,requests),path).toBe(true);
    for (const path of ["/approvals", "/items", "/vendors", "/rfqs", "/purchase-orders", "/purchase-receives", "/bills", "/payments", "/batch-payments", "/budgets", "/analytics", "/settings", "/settings/modules/items/preferences", "/unknown"]) expect(can(path,requests),path).toBe(false);
  });
  it("separates read, create and edit and always requires module access", () => {
    expect(can("/vendors",["procurement-access","procurement-vendor-read"])).toBe(true);
    expect(can("/vendors/new",["procurement-access","procurement-vendor-read"])).toBe(false);
    expect(can("/vendors/new",["procurement-access","procurement-vendor-create"])).toBe(true);
    expect(can("/vendors/id/edit",["procurement-access","procurement-vendor-create"])).toBe(false);
    expect(can("/vendors/id/edit",["procurement-access","procurement-vendor-edit"])).toBe(true);
    expect(can("/vendors",["procurement-vendor-read"])).toBe(false);
  });
  it("preserves assigned reviewers without granting purchasing or administration", () => {
    for (const permission of ["procurement-approval-read","procurement-approval-open","procurement-plan-review-read","procurement-round-plan-review","procurement-invoice-unit-review","procurement-po-approve"]) {
      const grants=["procurement-access",permission];expect(can("/approvals",grants),permission).toBe(true);
      expect(can("/purchase-orders/new",grants)).toBe(false);expect(can("/settings",grants)).toBe(false);
    }
    expect(can("/purchase-orders/id",["procurement-access","procurement-po-approve"])).toBe(true);
    expect(can("/purchase-orders",["procurement-access","procurement-po-approve"])).toBe(false);
    expect(can("/plans/id",["procurement-access","procurement-plan-review-read"])).toBe(true);
    expect(can("/rfqs/id?source=quotations",["procurement-access","procurement-quotation-read"])).toBe(true);
    expect(can("/rfqs/id?source=round-plan",["procurement-access","procurement-quotation-read"])).toBe(false);
  });
  it("preserves narrow receiving task entry without broad record or list access", () => {
    for (const [purpose,action] of [["inspection","procurement-receipt-inspect"],["acceptance","procurement-receipt-accept"],["certification","procurement-service-certify"]]) {
      const grants=["procurement-access",action];expect(can(`/purchase-receives/id?purpose=${purpose}`,grants)).toBe(true);
      expect(can("/purchase-receives",grants)).toBe(true);expect(can("/purchase-receives/id",grants)).toBe(false);
      expect(can(`/purchase-receives/id/edit?purpose=${purpose}`,grants)).toBe(false);
    }
  });
  it("retains normal goods/service detail links while checking scope at the API", () => {
    for (const purpose of ["receipts","services"]) expect(can(`/purchase-receives/id?purpose=${purpose}`,["procurement-access","procurement-receipt-view"])).toBe(true);
    expect(can("/purchase-receives/id?purpose=receipts",["procurement-access","procurement-receipt-inspect"])).toBe(false);
  });
  it("retains each explicitly granted module and configuration read surface", () => {
    for (const [path,permission] of [["/items","procurement-item-read"],["/rfqs","procurement-sourcing-read"],["/purchase-orders","procurement-po-read"],["/purchase-receives","procurement-receipt-view"],["/contracts","procurement-contract-read"],["/plans","procurement-plan-read"],["/recurring-bills","procurement-recurring-read"],["/bills","procurement-invoice-read"],["/payments","procurement-payment-read"],["/budgets","procurement-budget-check"],["/settings","procurement-configuration-read"]]) expect(can(path,["procurement-access",permission]),path).toBe(true);
  });
});
