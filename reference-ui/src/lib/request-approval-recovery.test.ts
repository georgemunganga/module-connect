import { describe, expect, it } from "vitest";
import { definiteRequestApprovalRejection } from "./request-approval-recovery";

describe("request approval transport outcome", () => {
  it.each([400, 401, 403, 404, 409, 422])("recognizes explicit rejection %s", status => {
    expect(definiteRequestApprovalRejection(status)).toBe(true);
  });
  it.each([0, 200, 408, 418, 429, 499, 500, 503, NaN])("retains unknown command for %s", status => {
    expect(definiteRequestApprovalRejection(status)).toBe(false);
  });
});
