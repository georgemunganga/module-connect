export type InvoiceLineLabel = { id: string; lineNumber: number; description: string };

export function manualUnitLineLabel(lines: readonly InvoiceLineLabel[] | null | undefined, invoiceLineId: string): string {
  const line = lines?.find(item => item.id === invoiceLineId);
  if (!line) return "Saved invoice line; refresh bill details to see its description";
  return `Line ${line.lineNumber}${line.description.trim() ? ` · ${line.description.trim()}` : ""}`;
}

/** Codes remain in the typed API error and server audit; ordinary screen text is actionable. */
export function manualUnitBlockerText(code: string): string {
  switch (code) {
    case "OriginalUnitReviewAlreadyOpened": return "A review is already recorded for these invoice links. Open its details above.";
    case "InvoiceManualUnitReviewExecutionDisabled": return "New manual reviews are paused. Saved reviews remain available.";
    case "InvoiceManualAttestationPolicyRequired":
    case "InvoiceUnitReviewPolicyUnavailable": return "A current manual unit review rule is needed. Ask a configuration reviewer to check the published rules.";
    case "PrincipalInvoiceMappingRequired":
    case "InvoiceManualMappingWithoutDocumentPinsRequired": return "Link the invoice lines as manually entered units before requesting review.";
    case "InvoiceUnitReviewMakerRequired": return "The person who saved these invoice links must request their review.";
    case "InvoiceUnitReviewerUnavailable": return "A named reviewer is no longer available. Ask a configuration reviewer to update the rule.";
    case "InvoiceUnitReviewIndependentReviewerRequired": return "Choose a different person to review these units; the maker cannot review their own work.";
    case "InvoiceMappingSuperseded":
    case "InvoiceManualUnitReviewCurrentMappingRequired": return "The invoice links changed. Refresh the bill and request a new review for the current links.";
    case "InvoiceOriginalChanged": return "The original invoice changed. Refresh the bill before continuing.";
    case "InvoiceUnitReviewSelectedBranchRequired": return "Choose the permitted branch for this invoice in Organisation context.";
    case "InvoiceManualUnitReviewSchemaUnavailable":
    case "InvoiceManualUnitReviewUnavailable": return "Manual review controls are not ready. Check saved history and try later.";
    default: return "The current invoice links or review evidence need another check. Refresh the bill or ask an administrator to inspect the saved history.";
  }
}
