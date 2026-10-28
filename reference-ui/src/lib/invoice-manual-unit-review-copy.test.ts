import { describe, expect, it } from "vitest";
import { manualUnitBlockerText, manualUnitLineLabel } from "./invoice-manual-unit-review-copy";

describe("manual unit review labels", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("uses the existing bill line number and description without exposing an ID", () => {
    expect(manualUnitLineLabel([{ id, lineNumber: 2, description: "Service hours" }], id)).toBe("Line 2 · Service hours");
    expect(manualUnitLineLabel([], id)).not.toContain(id);
  });
  it("maps known blockers to actions and keeps unknown codes out of ordinary labels", () => {
    expect(manualUnitBlockerText("InvoiceManualUnitReviewExecutionDisabled")).toContain("paused");
    expect(manualUnitBlockerText("InvoiceMappingSuperseded")).toContain("Refresh");
    expect(manualUnitBlockerText("InvoiceUnitReviewIndependentReviewerRequired")).toContain("different person");
    expect(manualUnitBlockerText("NewBackendCodeWithoutUiCopy")).not.toContain("NewBackendCodeWithoutUiCopy");
  });
});
