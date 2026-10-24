import type { PrincipalInvoiceLocator } from "../../../src/platform/procurement-principal-invoice-api";

/** Only nonsecret receipt locators are retained. Never persist document text,
 * invoice amounts, a command body or original document references. */
const prefix = "procurement:principal-invoice:pending:v1:";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value)
  && value.toLowerCase() !== "00000000-0000-0000-0000-000000000000";
const optionalId = (value: unknown) => value === null || id(value);
function valid(value: unknown): value is PrincipalInvoiceLocator {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<PrincipalInvoiceLocator>;
  return ["Map", "OpenReview", "Compare", "DecideReview", "IssueAction"].includes(String(row.operation)) && id(row.invoiceId) && id(row.key)
    && Number.isSafeInteger(row.invoiceVersion) && Number(row.invoiceVersion) > 0
    && Number.isSafeInteger(row.mappingRevision) && Number(row.mappingRevision) >= 0
    && optionalId(row.mappingVersionId) && optionalId(row.reviewId) && optionalId(row.reviewOutcomeId)
    && optionalId(row.orderId) && optionalId(row.issuedVersionId)
    && (row.expectedCaseVersion === undefined || row.expectedCaseVersion === null
      || Number.isSafeInteger(row.expectedCaseVersion) && Number(row.expectedCaseVersion) >= 1)
    && (row.operation !== "DecideReview" || id(row.reviewId) && Number.isSafeInteger(row.expectedCaseVersion))
    && (row.issueId === undefined || optionalId(row.issueId))
    && (row.expectedIssueVersion === undefined || row.expectedIssueVersion === null
      || Number.isSafeInteger(row.expectedIssueVersion) && Number(row.expectedIssueVersion) >= 1)
    && (row.operation !== "IssueAction" || id(row.issueId) && Number.isSafeInteger(row.expectedIssueVersion))
    && Object.keys(value).every((key) => ["operation", "invoiceId", "key", "invoiceVersion", "mappingRevision",
      "mappingVersionId", "reviewId", "reviewOutcomeId", "orderId", "issuedVersionId", "expectedCaseVersion",
      "issueId", "expectedIssueVersion"].includes(key));
}
export type PendingPrincipalInvoice = { locator: PrincipalInvoiceLocator | null; blocked: boolean };
export function readPrincipalInvoicePending(scope: string): PendingPrincipalInvoice {
  try { const raw = sessionStorage.getItem(prefix + scope);
    if (raw === null) return { locator: null, blocked: false };
    const decoded: unknown = JSON.parse(raw);
    return valid(decoded) ? { locator: decoded, blocked: true } : { locator: null, blocked: true };
  } catch { return { locator: null, blocked: true }; }
}
export function claimPrincipalInvoicePending(scope: string, locator: PrincipalInvoiceLocator): boolean {
  if (!valid(locator) || readPrincipalInvoicePending(scope).blocked) return false;
  try { const raw = JSON.stringify(locator); sessionStorage.setItem(prefix + scope, raw);
    return sessionStorage.getItem(prefix + scope) === raw; } catch { return false; }
}
export function clearPrincipalInvoicePending(scope: string, locator: PrincipalInvoiceLocator): boolean {
  if (readPrincipalInvoicePending(scope).locator?.key !== locator.key) return false;
  try { sessionStorage.removeItem(prefix + scope); return sessionStorage.getItem(prefix + scope) === null; }
  catch { return false; }
}
