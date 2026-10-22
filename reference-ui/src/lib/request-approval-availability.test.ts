import { describe, expect, it } from "vitest";
import { requestApprovalsAvailable } from "./request-approval-availability";

describe("purchase-request-only approval compatibility", () => {
  it.each([
    [false, false, false], [false, true, true], [true, false, true], [true, true, true],
  ])("legacy=%s principal=%s availability=%s", (approvals, principalApprovals, expected) => {
    const capabilities = { approvals, principalApprovals, orders: false, receiving: false, financeHandoff: false };
    expect(requestApprovalsAvailable(capabilities)).toBe(expected);
    expect(capabilities).toEqual({ approvals, principalApprovals, orders: false, receiving: false, financeHandoff: false });
  });
});
