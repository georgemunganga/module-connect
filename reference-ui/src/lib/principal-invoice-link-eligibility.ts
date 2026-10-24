import type { PrincipalInvoiceIssuePage, PrincipalInvoiceState } from "../../../src/platform/procurement-principal-invoice-api";

/** A visible link action is a hint only; the server verifies the retained
 * review outcome, Core case, discrepancy, original documents and CAS again. */
export function canLinkPrincipalInvoiceLines(state: PrincipalInvoiceState | null,
  issues: PrincipalInvoiceIssuePage | null): boolean {
  if (!state) return false;
  if (state.state === "Unmapped") return true;
  if (state.state === "Mapped") return ["Returned", "Rejected"].includes(state.reviewState)
    && !!state.reviewOutcomeId;
  return state.state === "ComparisonBlocked" && state.reviewState === "Verified"
    && !!state.reviewOutcomeId && !!state.mappingVersionId
    && !!issues?.items.some(issue => issue.mappingVersionId === state.mappingVersionId
      && !["Resolved", "CancelledWithReason"].includes(issue.state));
}
